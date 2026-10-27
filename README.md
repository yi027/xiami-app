# 瞎謎-APP

個人事件紀事。用電子郵件登入，記下食、衣、住、行、育、樂、工作，狀態從「開始」走到「執行」再到「結案」。可以邀請好友、把事件分享成一個參與群組，並在時間軸留下文字、圖片或影片。結案時可選擇只把摘要寄給自己，或寄給所有參與者。

A personal event ledger. Sign in with email, track food, clothing, housing, transport, education, leisure, and work, and move each event from started to in progress to closed. Invite friends, share an event with them, and keep a timeline of notes, images, and video. When you close an event you can email the summary to yourself or to every participant.

## 功能 / Features

- 電子郵件與密碼登入。密碼以 bcrypt 雜湊，登入狀態放在 httpOnly cookie。
- 事件欄位：標題、描述、狀態（開始 → 執行 → 結案）、相關人員、發生時間（台北時間）、類別、金額。
- 七個類別各有底色，列表與明細都看得到。
- 統計：各類別金額、總額，可依日期、狀態、類別篩選，並有簡單長條圖。統計只計算你自己建立的事件。
- 好友：輸入對方電子郵件送出邀請。對方接受或婉拒。還沒有帳號的人用同一個電子郵件註冊後，會在好友頁看到邀請。可以移除好友。
- 分享：事件建立者勾選已接受邀請的好友，組成參與群組。
- 時間軸：建立者與參與者都可以新增紀錄，可附圖片與影片。新的在上面，每則有作者與時間。
- 結案信可選「只寄給我」或「寄給我與所有參與者」，內容含時間軸摘要與附件連結。未設定 SMTP 時改寫伺服器日誌，結案與邀請都不會失敗。

Email and password sign-in. Passwords are bcrypt hashes. The session is an httpOnly cookie.

Event fields: title, description, status (start → in progress → closed), related people, time in Taipei, category, and amount.

Each of the seven categories has its own background colour on the list and the detail page.

Stats show per-category and total amounts, with date, status, and category filters and a simple bar chart. Stats include only events you created.

Friends: enter an email to send an invitation. They accept or decline. Someone without an account can register with that same email and then see the invite. Either person can remove the friendship.

Sharing: the owner picks accepted friends. Those people become the event's participant group.

Timeline: the owner and participants add records, including images and video. Newest first, each with author and timestamp.

On close, choose "only me" or "me and every participant". The message includes a timeline summary and attachment links. If SMTP is not configured, the message is written to the server log and the action still succeeds.

## 權限 / Permissions

相關人員是自由填寫的名字。參與者是有帳號、且已接受好友邀請的人。移除好友不會自動取消已經分享的事件；請在事件裡調整參與者。結案之後仍可繼續新增時間軸紀錄。

"Related people" are free-text names. Participants are accounts that accepted a friend invitation. Removing a friend does not revoke events already shared with them; change the participant list on the event. The timeline stays open after the event is closed.

| 動作 / Action | 建立者 / Owner | 參與者 / Participant | 其他人 / Anyone else |
| --- | --- | --- | --- |
| 查看事件與時間軸 / View the event and timeline | 可以 / yes | 可以 / yes | 不行 / no |
| 新增紀錄與附件 / Add records and files | 可以 / yes | 可以 / yes | 不行 / no |
| 修改標題、描述、類別、金額、時間、相關人員 / Edit core fields | 可以 / yes | 不行 / no | 不行 / no |
| 推進狀態與結案 / Advance status and close | 可以 / yes | 不行 / no | 不行 / no |
| 刪除事件 / Delete | 可以 / yes | 不行 / no | 不行 / no |
| 管理參與者 / Manage participants | 可以 / yes | 不行 / no | 不行 / no |
| 統計金額 / Money stats | 只計算自己建立的事件 / own events only | 別人分享的事件不計入 / shared events are excluded | — |

附件大小：圖片 JPEG、PNG、GIF、WebP，單檔 8 MB；影片 MP4、WebM，單檔 50 MB。每則紀錄最多 4 個附件、其中最多 1 部影片。伺服器會檢查檔案內容，不只看副檔名。

Attachment limits: JPEG, PNG, GIF, or WebP up to 8 MB; MP4 or WebM up to 50 MB. At most 4 files per record, and at most one video. The server checks the file bytes, not only the extension.

## 需求 / Requirements

- Node.js 22+
- npm
- Docker，用來跑 PostgreSQL（或你自己的 PostgreSQL 16）

Docker is used for PostgreSQL. Any PostgreSQL 16 server works.

## 本機開發 / Local development

只啟動資料庫，應用用 npm 跑：

Start only the database and run the app with npm:

```bash
docker compose up -d postgres
cp .env.example .env
# 編輯 .env，至少換掉 AUTH_SECRET
# Edit .env. At least replace AUTH_SECRET.
npm install
docker compose exec postgres psql -U xiami -d xiami -c "CREATE DATABASE xiami_test"
npm run setup
npm run dev
```

開啟 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

`npm run setup` 會套用 Prisma migration 並寫入示範資料。測試使用另一個資料庫 `xiami_test`，避免蓋到開發資料。

`npm run setup` applies Prisma migrations and writes demo data. Tests use a separate `xiami_test` database.

### 示範帳號 / Demo accounts

| 帳號 | 密碼 | 用途 |
| --- | --- | --- |
| `demo@xiami.app` | `xiami-demo` | 已有各類別的事件 |
| `other@xiami.app` | `other-demo` | 另一位使用者，用來確認資料隔離 |

再執行 `npm run db:seed` 不會重複事件；若該帳號還沒有事件，才會補上。密碼會重設回上表。

Running `npm run db:seed` again does not duplicate events. It only fills an account that has none. Passwords are reset to the table above.

## 用 Docker Compose 跑完整服務 / Full stack with Docker Compose

```bash
docker compose up --build
```

應用程式在 [http://127.0.0.1:43123](http://127.0.0.1:43123)。容器啟動時會執行 `prisma migrate deploy`。正式環境請用環境變數覆蓋 `AUTH_SECRET`，不要用 compose 檔裡的預設值。

The app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). The container runs `prisma migrate deploy` on startup. In production, override `AUTH_SECRET`. Do not keep the default from the compose file.

示範資料從宿主機寫入（主機的 5432 轉接到容器）：

Seed from the host (port 5432 is published):

```bash
DATABASE_URL="postgresql://xiami:xiami@127.0.0.1:5432/xiami" npm run db:seed
```

本機上傳的檔案在 compose volume `uploads`。正式環境請把 `STORAGE_DRIVER` 設成 `s3`，不要依賴容器磁碟。

Local uploads live in the `uploads` volume. In production set `STORAGE_DRIVER=s3`. Do not rely on the container disk.

## 環境變數 / Environment

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `AUTH_SECRET` | 簽署 session cookie 的密鑰，至少 16 字元 |
| `APP_URL` | 網站公開網址，不帶結尾斜線。信件裡的連結會用它 |
| `SMTP_HOST` | SMTP 主機。留空則只記錄信件 |
| `SMTP_PORT` | 連接埠，預設 `587` |
| `SMTP_SECURE` | `true` 時使用 TLS。埠 `465` 也會視為 secure |
| `SMTP_USER` | SMTP 帳號，可留空 |
| `SMTP_PASS` | SMTP 密碼 |
| `SMTP_FROM` | 寄件者。預設沿用 `SMTP_USER` |
| `STORAGE_DRIVER` | `local` 或 `s3` |
| `STORAGE_LOCAL_DIR` | `local` 時的目錄，預設 `./data/uploads` |
| `S3_ENDPOINT` | S3 相容端點。AWS 官方可留空 |
| `S3_REGION` | 區域。R2 常用 `auto` |
| `S3_BUCKET` | 儲存桶名稱 |
| `S3_ACCESS_KEY_ID` | 存取金鑰 |
| `S3_SECRET_ACCESS_KEY` | 秘密金鑰 |
| `S3_FORCE_PATH_STYLE` | `true` 或 `false`。有 `S3_ENDPOINT` 時預設 path-style |

### S3 相容儲存 / S3-compatible storage

應用只依賴 S3 API，不綁定單一雲端。`STORAGE_DRIVER=s3` 時用同一組變數：

The app speaks the S3 API only. With `STORAGE_DRIVER=s3` the same variables cover:

- AWS S3：`S3_ENDPOINT` 留空，`S3_REGION` 填區域，`S3_FORCE_PATH_STYLE=false`
- Cloudflare R2：`S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com`，`S3_REGION=auto`，`S3_FORCE_PATH_STYLE=true`
- Google Cloud Storage interoperability：`S3_ENDPOINT=https://storage.googleapis.com`，使用 HMAC 金鑰，依桶的存取方式設定 `S3_FORCE_PATH_STYLE`
- MinIO：`S3_ENDPOINT=http://minio:9000`，`S3_FORCE_PATH_STYLE=true`

附件下載一律經過應用程式，並檢查你是建立者或參與者。信件裡的連結指回 `APP_URL/api/attachments/<id>`，未登入時會導向登入頁。

Downloads go through the app, which checks that you own the event or participate in it. Email links point at `APP_URL/api/attachments/<id>` and send anonymous visitors to the login page.

## 測試 / Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

測試包含狀態流程、金額、統計篩選、未設定 SMTP 時的信件記錄、好友邀請與註冊後接受、權限（外人不能讀寫、參與者不能刪除或改核心欄位）、時間軸與附件驗證，以及結案信收件者選擇。

Tests cover the status flow, money, stat filters, the SMTP log fallback, friend invites including register-then-accept, permissions (outsiders cannot read or write; participants cannot delete or edit core fields), timeline attachments, and the close-email recipient choice.

## 指令 / Scripts

- `npm run dev` — 開發伺服器，埠 43123
- `npm run build` / `npm start` — 正式建置
- `npm run lint` — ESLint
- `npm run typecheck` — 產生 Next 型別並執行 `tsc --noEmit`
- `npm test` — Vitest
- `npm run setup` — 套用 migration 並寫入示範資料
- `npm run db:migrate` — `prisma migrate deploy`
- `npm run db:seed` — 只寫入示範資料

## 部署 / Deploy

映像是多階段 Dockerfile，Next.js 以 `NEXT_STANDALONE=1` 產生 standalone 輸出。執行時只需要環境變數，不依賴特定雲端的 SDK 以外的服務。資料庫用任何 PostgreSQL，檔案用本機磁碟或任何 S3 相容儲存。

The image is a multi-stage Dockerfile. Next.js standalone output is enabled when `NEXT_STANDALONE=1`. Runtime configuration is environment variables. Use any PostgreSQL database and either local disk or any S3-compatible store.

### Vercel

Vercel 不使用這份 Dockerfile。在專案設定：

Vercel does not use this Dockerfile. In the project settings:

- Build command：`prisma migrate deploy && next build`
- Install command：`npm ci`
- 環境變數帶上 `DATABASE_URL`、`AUTH_SECRET`、`APP_URL`、SMTP，以及 `STORAGE_DRIVER=s3` 和 S3 變數。Vercel 的檔案系統會重置，不要用 `local`。
- Set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, SMTP, and `STORAGE_DRIVER=s3` plus the S3 variables. Vercel's filesystem is ephemeral, so do not use `local`.
- PostgreSQL 可用 Neon、Supabase 或任何託管 Postgres。連線字串放在 `DATABASE_URL`。

### Render、Fly.io、Zeabur

這三個都能直接跑 Docker 映像或 Node 服務。

All three can run the Docker image or a Node service.

1. 建立 PostgreSQL（平台內建或外部）。
2. 用本倉庫的 Dockerfile 建置。Fly.io 可用 `fly launch` 後指定 Dockerfile；Render 選 Docker web service；Zeabur 選 Dockerfile。
3. 設定與 `.env.example` 相同的環境變數。`APP_URL` 用平台給的 HTTPS 網址。`DATABASE_URL` 用內部主機名稱。
4. 容器入口會先 migrate 再啟動。埠是 `43123`（`PORT` 可覆寫）。
5. 正式環境使用 `STORAGE_DRIVER=s3`。若暫時用 `local`，請把 `/data/uploads` 掛上持久磁碟。

Create PostgreSQL, build this Dockerfile, set the same variables as `.env.example`, and point `APP_URL` at the public HTTPS origin. The entrypoint migrates, then listens on port `43123` (`PORT` overrides it). Prefer `STORAGE_DRIVER=s3`. If you use `local`, mount a persistent disk at `/data/uploads`.

### AWS、GCP、Azure 容器服務

映像可推到任何容器倉庫，再跑在：

Push the image to any registry and run it on:

- AWS ECS 或 App Runner，前面加 ALB。資料庫用 RDS PostgreSQL 或相容服務。檔案用 S3，`S3_ENDPOINT` 留空。
- Google Cloud Run。逐步設定、Workload Identity Federation 與費用粗估見 [docs/deploy-gcp.md](docs/deploy-gcp.md)。推到 `main` 且已設定 `GCP_PROJECT_ID` 時，`.github/workflows/deploy-gcp.yml` 會建置映像、用 Cloud Run Job 執行 migration，再部署服務。資料庫用 Cloud SQL PostgreSQL（Unix socket）。檔案用 `STORAGE_DRIVER=gcs`（執行身分，不需要 HMAC）；既有的 S3 interoperability（`https://storage.googleapis.com` 加 HMAC）仍然可用。GKE 也可跑同一份映像。
- Azure Container Apps 或 AKS。資料庫用 Azure Database for PostgreSQL。檔案可用 MinIO、Cloudflare R2，或任何 S3 相容端點。Azure Blob 沒有原生 S3 API，請用相容閘道或改放 R2／S3。

AWS ECS or App Runner with RDS and S3. Google Cloud Run with Cloud SQL and native Cloud Storage (`docs/deploy-gcp.md`); GCS S3 interoperability still works. GKE can run the same image. Azure Container Apps or AKS with Azure Database for PostgreSQL and an S3-compatible store such as MinIO or R2. Azure Blob itself has no S3 API.

不論哪一家，程序都一樣：建置映像、設定環境變數、讓容器能連上 Postgres、由入口執行 migration、把 `APP_URL` 設成對外網址。不要把雲端帳號金鑰寫進映像。

On every cloud: build the image, set environment variables, let the container reach Postgres, migrate from the entrypoint, and set `APP_URL` to the public origin. Do not bake cloud credentials into the image.

GitHub Actions（`.github/workflows/ci.yml`）會安裝依賴、lint、型別檢查、測試、建置 Next.js，並建置 Docker 映像。Cloud Run 部署是另一個 workflow，只有設定 GCP 變數後才會在推上 `main` 時執行，不會影響 Vercel、Render、Fly.io、Zeabur 或其他容器平台。

GitHub Actions (`.github/workflows/ci.yml`) installs dependencies, then lints, typechecks, tests, builds Next.js, and builds the Docker image. Cloud Run deploy is a separate workflow and runs on pushes to `main` only after the GCP variables are set. It does not affect Vercel, Render, Fly.io, Zeabur, or other container hosts.
