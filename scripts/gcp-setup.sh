#!/usr/bin/env bash
# Create the GCP resources used by docs/deploy-gcp.md.
# Re-running skips resources that already exist. Passwords and AUTH_SECRET are not printed.
#
# Required:
#   PROJECT_ID=my-gcp-project ./scripts/gcp-setup.sh
#
# Optional:
#   REGION=asia-east1
#   REPO=xiami
#   SQL_INSTANCE=xiami-pg
#   SQL_TIER=db-f1-micro
#   DB_NAME=xiami
#   DB_USER=xiami
#   DB_PASSWORD=...          # used only when the database user is created
#   BUCKET=PROJECT_ID-xiami-uploads
#   GITHUB_REPO=yi027/xiami-app
#   RUNTIME_SA_NAME=xiami-run
#   DEPLOY_SA_NAME=xiami-deploy
#   UPDATE_DB_SECRET=1       # also requires DB_PASSWORD; resets the DB user password and the secret

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-asia-east1}"
REPO="${REPO:-xiami}"
SQL_INSTANCE="${SQL_INSTANCE:-xiami-pg}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
DB_NAME="${DB_NAME:-xiami}"
DB_USER="${DB_USER:-xiami}"
GITHUB_REPO="${GITHUB_REPO:-yi027/xiami-app}"
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-xiami-run}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-xiami-deploy}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-github}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "請設定 PROJECT_ID。例如：PROJECT_ID=my-gcp-project ./scripts/gcp-setup.sh" >&2
  exit 1
fi

BUCKET="${BUCKET:-${PROJECT_ID}-xiami-uploads}"
RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"

echo "啟用 API..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  storage.googleapis.com \
  cloudresourcemanager.googleapis.com

echo "Artifact Registry..."
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="xiami-app images"
fi

echo "Cloud SQL（新執行個體可能要幾分鐘）..."
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  root_password="$(openssl rand -base64 24)"
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=enterprise \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-size=10GB \
    --storage-type=SSD \
    --availability-type=zonal \
    --root-password="$root_password"
  unset root_password
fi

if ! gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
fi

created_user=0
if ! gcloud sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    DB_PASSWORD="$(openssl rand -hex 16)"
  fi
  gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
  created_user=1
elif [[ "${UPDATE_DB_SECRET:-}" == "1" ]]; then
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "UPDATE_DB_SECRET=1 時請一併設定 DB_PASSWORD。" >&2
    exit 1
  fi
  gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
  created_user=1
fi

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

write_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy=automatic --data-file=- >/dev/null
  fi
}

if [[ "$created_user" == "1" ]]; then
  encoded_password="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASSWORD")"
  database_url="postgresql://${DB_USER}:${encoded_password}@localhost/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}"
  write_secret xiami-database-url "$database_url"
  unset DB_PASSWORD encoded_password database_url
  echo "已寫入 Secret Manager：xiami-database-url（內容不顯示）。"
else
  echo "資料庫使用者已存在，未改密碼，也未覆寫 xiami-database-url。"
  echo "若 secret 還沒建立，請用已知密碼執行：UPDATE_DB_SECRET=1 DB_PASSWORD=... PROJECT_ID=... ./scripts/gcp-setup.sh"
fi

if ! gcloud secrets describe xiami-auth-secret >/dev/null 2>&1; then
  auth_secret="$(openssl rand -base64 32 | tr -d '\n')"
  write_secret xiami-auth-secret "$auth_secret"
  unset auth_secret
  echo "已建立 Secret Manager：xiami-auth-secret（內容不顯示）。"
fi

echo "Cloud Storage bucket..."
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi

create_sa() {
  local name="$1"
  local display="$2"
  local email="${name}@${PROJECT_ID}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$email" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$name" --display-name="$display"
  fi
}

create_sa "$RUNTIME_SA_NAME" "xiami Cloud Run runtime"
create_sa "$DEPLOY_SA_NAME" "xiami GitHub deploy"

bind_project() {
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$1" \
    --role="$2" \
    --condition=None \
    --quiet >/dev/null
}

bind_project "serviceAccount:${RUNTIME_SA}" "roles/cloudsql.client"
bind_project "serviceAccount:${DEPLOY_SA}" "roles/run.admin"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
bind_project "serviceAccount:service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com" "roles/cloudsql.client"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectAdmin" \
  --quiet >/dev/null

gcloud artifacts repositories add-iam-policy-binding "$REPO" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null

for secret in xiami-database-url xiami-auth-secret; do
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${RUNTIME_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet >/dev/null
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:${DEPLOY_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet >/dev/null
  fi
done

echo "Workload Identity Federation..."
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" \
    --location=global \
    --display-name="GitHub"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --workload-identity-pool="$POOL" \
  --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global \
    --workload-identity-pool="$POOL" \
    --display-name="GitHub" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet >/dev/null

PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

cat <<EOF

設定完成。請到 GitHub → Settings → Secrets and variables → Actions。

Variables:
  GCP_PROJECT_ID=${PROJECT_ID}
  GCP_REGION=${REGION}
  GCP_ARTIFACT_REPOSITORY=${REPO}
  GCP_SQL_CONNECTION_NAME=${CONNECTION_NAME}
  GCP_RUNTIME_SERVICE_ACCOUNT=${RUNTIME_SA}
  GCS_BUCKET=${BUCKET}
  GCP_SERVICE_NAME=xiami
  GCP_AUTH_METHOD=wif
  APP_URL=   （可留空，第一次部署後 workflow 會寫入 Cloud Run 網址）

Secrets:
  GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_RESOURCE}
  GCP_SERVICE_ACCOUNT=${DEPLOY_SA}

金鑰備援才需要另建 GCP_SA_KEY，並把 GCP_AUTH_METHOD 改成 key。預設不要建立金鑰。
說明見 docs/deploy-gcp.md。
EOF
