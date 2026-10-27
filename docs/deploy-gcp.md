# 把瞎謎-APP 部署到 Google Cloud

這份說明給第一次用 Google Cloud 的人。做完之後，程式跑在 **Cloud Run**，資料庫是 **Cloud SQL for PostgreSQL**，上傳檔案在 **Cloud Storage**，密碼放在 **Secret Manager**。推上 GitHub 的 `main` 分支後，GitHub Actions 會自動部署。

Vercel、Render、Fly.io、Zeabur、本機 `docker compose`，以及 AWS／Azure 的部署方式都維持原樣。沒有設定下面的 GitHub 變數時，部署 workflow 會直接跳過，不會讓 CI 失敗。

## 你會得到什麼

- 容器映像放在 Artifact Registry，映像來自倉庫裡現有的 `Dockerfile`。
- Cloud Run 服務聽埠 `43123`，沒有流量時可以縮到 0。
- Cloud Run 透過內建的 Cloud SQL connector，把 Unix socket 掛在 `/cloudsql/專案:地區:執行個體`。應用程式不用另外裝 proxy。
- 每次部署先跑一個 Cloud Run Job 執行 `prisma migrate deploy`，成功後才更新網站。網站本身設 `SKIP_MIGRATE=1`，避免每次冷啟動都再 migrate。本機與其他平台的容器入口仍會照常 migrate。
- 上傳使用 `STORAGE_DRIVER=gcs`。Cloud Run 的執行身分直接存取 bucket，不需要 HMAC 金鑰。若你已有 HMAC，仍可改用原本的 `STORAGE_DRIVER=s3`。

## 0. 事前準備

1. 一個 Google 帳號。
2. 一張可以綁在 Google Cloud 的信用卡。Cloud SQL 會收費，請先看文末的費用粗估。
3. 這個 Git 倉庫的管理員權限（要新增 GitHub Actions secrets 與 variables）。
4. 在自己的電腦安裝 [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)。安裝後執行：

```bash
gcloud auth login
gcloud auth application-default login
```

也可以不手動敲每一條指令，改跑文末的 `scripts/gcp-setup.sh`。建議仍先讀過每一段，才知道它建立了什麼。

## 1. 建立專案並開啟結帳

1. 打開 [Google Cloud Console](https://console.cloud.google.com/)。
2. 上方專案選單 → **新增專案**。專案 ID 建立後不能改，例如 `xiami-prod`。下文用 `PROJECT_ID` 代表它。
3. 選單 → **結帳**，把專案綁到一個帳單帳戶。沒有帳單時，Cloud SQL 與部分 API 無法建立。
4. 讓 CLI 指向這個專案：

```bash
gcloud config set project PROJECT_ID
```

## 2. 啟用 API

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  storage.googleapis.com \
  cloudresourcemanager.googleapis.com
```

| API | 用途 |
| --- | --- |
| Cloud Run | 跑網站與 migration job |
| Cloud SQL Admin | 建立 PostgreSQL |
| Artifact Registry | 存放 Docker 映像 |
| Secret Manager | 存放 `DATABASE_URL` 與 `AUTH_SECRET` |
| IAM / IAM Credentials | 服務帳號與 GitHub 的 Workload Identity Federation |
| Cloud Storage | 附件 |
| Cloud Resource Manager | 讀取專案編號 |

## 3. 建立 Artifact Registry

地區請和後面的 Cloud Run、Cloud SQL、bucket 相同。這裡用台灣的 `asia-east1`。

```bash
gcloud artifacts repositories create xiami \
  --repository-format=docker \
  --location=asia-east1 \
  --description="xiami-app images"
```

映像網址會像：

```text
asia-east1-docker.pkg.dev/PROJECT_ID/xiami/xiami:GIT_SHA
```

## 4. 建立 Cloud SQL

執行個體、資料庫、使用者是三個不同的東西。

```bash
gcloud sql instances create xiami-pg \
  --database-version=POSTGRES_16 \
  --edition=enterprise \
  --tier=db-f1-micro \
  --region=asia-east1 \
  --storage-size=10GB \
  --storage-type=SSD \
  --availability-type=zonal \
  --root-password='請換成一長串隨機字，這個密碼只給 postgres 管理者'
```

建立通常要數分鐘。`db-f1-micro` 是最小的共用核心，適合個人或小流量。正式且不能中斷的服務再考慮較大的規格與高可用。

接著建立應用程式用的資料庫與使用者。不要用 `postgres` 超級使用者跑網站。

```bash
gcloud sql databases create xiami --instance=xiami-pg

# 密碼只含英數可少掉網址編碼的麻煩。請自己換成隨機字。
gcloud sql users create xiami --instance=xiami-pg --password='換成資料庫使用者密碼'
```

查連線名稱，格式是 `PROJECT_ID:asia-east1:xiami-pg`：

```bash
gcloud sql instances describe xiami-pg --format='value(connectionName)'
```

Cloud Run 走 connector，**不要**把 `0.0.0.0/0` 加進授權網路。執行個體可以有公開 IP，但沒有授權網路時，外面仍無法直接連上。

密碼若含有 `@`、`:`、`/` 等字元，放進連線字串前要用 URL encode。連線字串格式：

```text
postgresql://xiami:編碼後的密碼@localhost/xiami?host=/cloudsql/PROJECT_ID:asia-east1:xiami-pg
```

`localhost` 配上 `host=/cloudsql/...` 是 Prisma 走 Unix socket 的寫法。Cloud Run 會把該目錄掛進容器。

## 5. 建立 Cloud Storage bucket

Bucket 名稱在整個 Google Cloud 必須唯一。

```bash
gcloud storage buckets create gs://PROJECT_ID-xiami-uploads \
  --location=asia-east1 \
  --uniform-bucket-level-access
```

不要把 bucket 設成公開。附件是透過已登入的網站下載，物件本身不需要公開網址。

## 6. 建立兩個服務帳號

- `xiami-run`：Cloud Run 網站與 migration job 的執行身分。它能連資料庫、讀密鑰、寫 bucket。
- `xiami-deploy`：GitHub Actions 用來推映像與部署。它不能當成長期金鑰放在筆記本裡。

```bash
gcloud iam service-accounts create xiami-run --display-name="xiami Cloud Run runtime"
gcloud iam service-accounts create xiami-deploy --display-name="xiami GitHub deploy"
```

完整信箱是 `xiami-run@PROJECT_ID.iam.gserviceaccount.com` 與 `xiami-deploy@PROJECT_ID.iam.gserviceaccount.com`。

### 執行身分的角色

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:xiami-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud storage buckets add-iam-policy-binding gs://PROJECT_ID-xiami-uploads \
  --member="serviceAccount:xiami-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

for SECRET in xiami-database-url xiami-auth-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:xiami-run@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

`storage.objectAdmin` 只綁在這個 bucket。Secret 的角色請在下一步建立 secret 之後再執行；若 secret 尚未存在，這段會失敗，那是正常的。

### 部署身分的角色

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:xiami-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud artifacts repositories add-iam-policy-binding xiami \
  --location=asia-east1 \
  --member="serviceAccount:xiami-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding \
  xiami-run@PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:xiami-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

`roles/iam.serviceAccountUser` 讓部署帳號可以指定「用 `xiami-run` 來跑服務」，但它本身不能讀取 secret 的值。再補上 secret 讀取，避免部署指令在綁定 secret 時被拒：

```bash
for SECRET in xiami-database-url xiami-auth-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:xiami-deploy@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

Cloud Run 服務代理也需要連 Cloud SQL：

```bash
PROJECT_NUMBER="$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')"
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

## 7. 把密鑰放進 Secret Manager

Secret 的 ID 要和 workflow 一致：`xiami-database-url`、`xiami-auth-secret`。

```bash
printf '%s' 'postgresql://xiami:編碼後的密碼@localhost/xiami?host=/cloudsql/PROJECT_ID:asia-east1:xiami-pg' \
  | gcloud secrets create xiami-database-url --replication-policy=automatic --data-file=-

printf '%s' "$(openssl rand -base64 32)" \
  | gcloud secrets create xiami-auth-secret --replication-policy=automatic --data-file=-
```

`AUTH_SECRET` 至少 16 個字元，用來簽署登入 cookie。不要把這兩個值寫進 Git、映像或 GitHub variables。

SMTP 不是第一次部署的必要項目。沒有 SMTP 時，邀請信與結案信只寫進 Cloud Run 日誌，操作仍會成功。之後若要寄信，可在 Cloud Run 服務加上 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`。密碼建議另建 secret，再用 `--update-secrets` 掛上。

建立 secret 後，回到上一節把 `secretAccessor` 補上。

## 8. 讓 GitHub Actions 用 Workload Identity 登入

不要下載服務帳號 JSON 金鑰，除非你走文末的備援方案。

Workload Identity Federation 會讓 GitHub 用短期權杖換取 `xiami-deploy` 的權限，而且只接受這個倉庫。

```bash
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='yi027/xiami-app'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

若倉庫不是 `yi027/xiami-app`，把 `attribute-condition` 裡的名稱改成你的 `擁有者/倉庫`。

允許這個倉庫扮演部署帳號：

```bash
PROJECT_NUMBER="$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding \
  xiami-deploy@PROJECT_ID.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/yi027/xiami-app"
```

Provider 的完整資源名稱（下一步要貼進 GitHub secret）：

```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
```

`PROJECT_NUMBER` 是數字，不是專案 ID。

## 9. 設定 GitHub secrets 與 variables

打開 GitHub 倉庫 → **Settings** → **Secrets and variables** → **Actions**。

### Variables

Variables 不是密文，不要放密碼。

| 名稱 | 必填 | 範例 | 說明 |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | 是 | `xiami-prod` | 留空時 workflow 會跳過，不會部署 |
| `GCP_REGION` | 否 | `asia-east1` | 空白時用 `asia-east1` |
| `GCP_ARTIFACT_REPOSITORY` | 否 | `xiami` | 空白時用 `xiami` |
| `GCP_SERVICE_NAME` | 否 | `xiami` | Cloud Run 服務名稱，空白時用 `xiami` |
| `GCP_SQL_CONNECTION_NAME` | 是 | `xiami-prod:asia-east1:xiami-pg` | 設定了專案 ID 之後就必須有 |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | 是 | `xiami-run@xiami-prod.iam.gserviceaccount.com` | 網站與 migration 的執行身分 |
| `GCS_BUCKET` | 是 | `xiami-prod-xiami-uploads` | 不含 `gs://` |
| `GCP_AUTH_METHOD` | 否 | `wif` | `wif`（預設）或 `key` |
| `APP_URL` | 否 | `https://xiami.example.com` | 留空時，第一次部署後會改成 Cloud Run 給的 `https://….run.app` |

### Secrets

| 名稱 | 何時需要 | 值 |
| --- | --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `GCP_AUTH_METHOD` 不是 `key` 時必填 | `projects/數字/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_SERVICE_ACCOUNT` | 同上 | `xiami-deploy@PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_SA_KEY` | 只有 `GCP_AUTH_METHOD=key` | 服務帳號 JSON 金鑰的整份內容 |

設定 `GCP_PROJECT_ID` 之後，另外三個（連線名稱、執行身分、bucket）缺一會讓部署失敗。這是刻意的，避免部署到一半才連不上資料庫。

## 10. 第一次部署

Workflow 檔是 `.github/workflows/deploy-gcp.yml`。它會在推上 `main` 時執行，也可以在 Actions 頁面手動 **Run workflow**。

它做的事：

1. 用 Workload Identity（或金鑰備援）登入 Google Cloud。
2. 用現有 Dockerfile 建置映像，推到 Artifact Registry，標籤是該次 commit SHA 與 `latest`。
3. 建立或更新 Cloud Run Job `xiami-migrate`（若你改了服務名稱，則是 `服務名稱-migrate`）。Job 覆寫入口指令，只執行 Prisma migration，並掛上同一條 Cloud SQL socket 與 `DATABASE_URL` secret。
4. 等待 Job 成功。
5. 部署 Cloud Run 服務：執行身分、Cloud SQL、兩個 secrets、`STORAGE_DRIVER=gcs`、`SKIP_MIGRATE=1`、允許未登入的網際網路存取、記憶體 512Mi、最少 0 個執行個體。容器入口會把 `HOSTNAME` 設成 `0.0.0.0`，因為 Cloud Run 注入的主機名稱會讓 Next.js standalone 聽錯位址。這只影響 Docker 入口，不影響 Vercel。
6. 若沒有設定 `APP_URL`，把 Cloud Run 的網址寫回服務的 `APP_URL`，邀請信與結案信的連結才會正確。

部署完成後，打開 Actions 日誌最後印出的網址。用示範帳號或自行註冊登入。註冊與好友功能不需要 SMTP 也能用，信的內容在 Cloud Run 日誌裡。

查看日誌：

```bash
gcloud run services logs read xiami --region=asia-east1 --limit=50
```

## 11. 自訂網域

先讓 `https://….run.app` 可以登入，再綁自己的網域。

`asia-east1` 可以使用 Cloud Run 的網域對應。這項功能仍是 Preview，Google 不把它當成正式環境的建議方案；個人或小網站通常夠用。憑證由 Google 自動申請，常常約 15 分鐘，有時會到 24 小時。

先到 [Cloud Run 網域對應](https://cloud.google.com/run/docs/mapping-custom-domains) 的說明，用 Search Console 驗證你擁有這個網域（驗證根網域一次即可）。然後：

```bash
gcloud beta run domain-mappings create \
  --service=xiami \
  --domain=app.example.com \
  --region=asia-east1
```

指令會印出要加的 DNS 紀錄。到網域商新增那些 A／AAAA 或 CNAME。憑證生效後：

1. 把 GitHub variable `APP_URL` 設為 `https://app.example.com`（不要加結尾斜線）。
2. 再推一次 `main`，或手動跑 workflow。服務的 `APP_URL` 會改成這個網址。

若地區不支援網域對應，請改用全域外部 Application Load Balancer 把網域指到 Cloud Run。那條路多一個轉送規則，費用大約每月 18 美元起，設定也較長，見 [Cloud Run 自訂網域文件](https://cloud.google.com/run/docs/mapping-custom-domains)。

只改 DNS、卻沒有做網域對應或負載平衡器時，Cloud Run 會因為 Host 不符而拒絕請求。

## 12. 服務帳號金鑰備援

優先使用上一節的 Workload Identity。金鑰不會過期，外洩後可以一直部署，直到你手動刪除。

只有在組織政策不允許 Workload Identity 時才用這條路：

```bash
gcloud iam service-accounts keys create /tmp/xiami-deploy.json \
  --iam-account=xiami-deploy@PROJECT_ID.iam.gserviceaccount.com
```

1. 打開 `/tmp/xiami-deploy.json`，整份貼進 GitHub secret `GCP_SA_KEY`。
2. 把 variable `GCP_AUTH_METHOD` 設為 `key`。
3. 刪掉本機的 JSON 檔。不要 commit。

Workflow 在 `GCP_AUTH_METHOD=key` 時只使用 `GCP_SA_KEY`，不會同時使用 Workload Identity。Google 的登入 action 一次只接受一種登入方式。

## 13. 每月費用粗估

以下是 2026 年前後、`asia-east1`、小流量個人使用的粗估，不是報價。請用 [Google Cloud 價格計算機](https://cloud.google.com/products/calculator) 再算一次。帳單以主控台為準。

| 項目 | 這份設定 | 粗估 |
| --- | --- | --- |
| Cloud SQL | `db-f1-micro`、10GB SSD、單一區、執行個體一直開著 | 大約每月 10–18 美元。這是主要花費 |
| Cloud Run | 512Mi、縮到 0、低流量 | 常常落在免費額度或每月數美元內 |
| Artifact Registry | 一個應用映像 | 約 0.5GB 內常在免費額度，超出後約每 GB 0.10 美元 |
| Cloud Storage | 附件，bucket 不公開 | 個人用量通常不到 1 美元 |
| Secret Manager | 2 個 secret | 在免費的有效版本額度內 |
| 自訂網域對應 | Preview 網域對應 | 本身通常不加價；改走負載平衡器則另計，轉送規則大約每月 18 美元起 |

執行個體停機後，Cloud SQL 仍會計儲存空間，網站也會連不上資料庫。不要為了省幾美元把授權網路打開。

## 14. 可選的安裝腳本

倉庫裡的 `scripts/gcp-setup.sh` 會做第 2–8 節：啟用 API、建立倉庫、Cloud SQL、資料庫與使用者、bucket、兩個服務帳號、角色、兩個 secret，以及 Workload Identity。已存在的資源會跳過。它不會印出資料庫密碼或 `AUTH_SECRET`。

```bash
PROJECT_ID=你的專案ID ./scripts/gcp-setup.sh
```

常用覆寫：`REGION`、`GITHUB_REPO`、`BUCKET`、`DB_PASSWORD`。使用者已經存在時，腳本不會改密碼。若要重設並覆寫 secret：

```bash
UPDATE_DB_SECRET=1 DB_PASSWORD='新密碼' PROJECT_ID=你的專案ID ./scripts/gcp-setup.sh
```

腳本結束時會印出要貼進 GitHub 的 variables 與 secrets 名稱。

## 15. 和其他部署方式的關係

- `docker compose` 仍使用本機 Postgres 與 `STORAGE_DRIVER=local`。入口只有在 `SKIP_MIGRATE=1` 時才略過 migration，compose 沒有設這個變數。
- Vercel 不使用這份 Dockerfile，也不讀這個 workflow。
- `STORAGE_DRIVER=s3` 的 AWS S3、Cloudflare R2、MinIO，以及 GCS HMAC（endpoint `https://storage.googleapis.com`）都還在。
- CI（`.github/workflows/ci.yml`）不需要任何 GCP 憑證。

## 16. 遇到問題時

- **部署被跳過**：還沒設定 variable `GCP_PROJECT_ID`。
- **Job 連不上資料庫**：確認 `xiami-database-url` 的 `host=/cloudsql/...` 與 `GCP_SQL_CONNECTION_NAME` 相同，密碼已 URL encode，而且 `xiami-run` 與 Cloud Run 服務代理都有 `roles/cloudsql.client`。
- **上傳失敗**：`GCS_BUCKET` 要是名稱本身，bucket 區域不限但建議與服務相同，`xiami-run` 要有該 bucket 的 `roles/storage.objectAdmin`。
- **GitHub 登入 Google 失敗**：Provider 資源名稱要用專案編號；`attribute-condition` 的倉庫名稱要完全一致；`xiami-deploy` 要有 `roles/iam.workloadIdentityUser`。
- **網站開了但邀請連結是 localhost**：把 `APP_URL` 設成對外的 https 網址後重新部署。
