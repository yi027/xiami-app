# 瞎謎-APP

個人事件紀事。用電子郵件登入，記下食、衣、住、行、育、樂、工作，狀態從「開始」走到「執行」再到「結案」。結案時會把摘要寄回你自己的信箱。

A personal event ledger. Sign in with your email, track food, clothing, housing, transport, education, leisure, and work, and move each event from started to in progress to closed. Closing an event emails a summary back to you.

## 功能 / Features

- 電子郵件與密碼登入。密碼以 bcrypt 雜湊，登入狀態放在 httpOnly cookie。每位使用者只看得到自己的事件。
- 事件欄位：標題、描述、狀態（開始 → 執行 → 結案）、相關人員、發生時間（台北時間）、類別、金額。
- 七個類別各有底色，列表與明細都看得到。
- 統計：各類別金額、總額，可依日期、狀態、類別篩選，並有簡單長條圖。
- 結案時寄出摘要。未設定 SMTP 時改寫伺服器日誌，結案不會失敗。

## 需求 / Requirements

- Node.js 22+
- npm

## 啟動 / Setup

```bash
npm install
cp .env.example .env
# 編輯 .env，至少換掉 AUTH_SECRET
npm run setup
npm run dev
```

開啟 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

`npm run setup` 會建立 SQLite 並寫入示範資料。資料庫檔在 `prisma/dev.db`。

### 示範帳號 / Demo accounts

| 帳號 | 密碼 | 用途 |
| --- | --- | --- |
| `demo@xiami.app` | `xiami-demo` | 已有各類別的事件 |
| `other@xiami.app` | `other-demo` | 另一位使用者，用來確認資料隔離 |

再執行 `npm run db:seed` 不會重複事件；若該帳號還沒有事件，才會補上。密碼會重設回上表。

## 環境變數 / Environment

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | SQLite 連線，例如 `file:./dev.db` |
| `AUTH_SECRET` | 簽署 session cookie 的密鑰，至少 16 字元 |
| `SMTP_HOST` | SMTP 主機。留空則只記錄信件 |
| `SMTP_PORT` | 連接埠，預設 `587` |
| `SMTP_SECURE` | `true` 時使用 TLS。埠 `465` 也會視為 secure |
| `SMTP_USER` | SMTP 帳號，可留空 |
| `SMTP_PASS` | SMTP 密碼 |
| `SMTP_FROM` | 寄件者。預設沿用 `SMTP_USER` |

結案信的收件者永遠是目前登入者自己的電子郵件。

## 測試 / Tests

```bash
npm test
```

包含狀態流程、金額、統計篩選、未設定 SMTP 時的信件記錄，以及用暫存 SQLite 檢查「看不到別人的事件」和結案寫日誌。

## 指令 / Scripts

- `npm run dev` — 開發伺服器，埠 43123
- `npm run build` / `npm start` — 正式建置
- `npm run lint` — ESLint
- `npm test` — Vitest
- `npm run setup` — 建立資料庫並寫入示範資料
