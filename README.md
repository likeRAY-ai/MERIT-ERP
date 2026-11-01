# MERIT-ERP

電腦整機、零件、周邊銷售管理系統。電腦與手機用瀏覽器即可使用，資料即時同步。

完整規劃見 [docs/PLAN.md](docs/PLAN.md)。

## 目前功能（第一階段）

- **帳號與權限**：老闆／店員／會計三種角色，店員看不到成本與毛利
- **商品**：分類、品牌、規格、零售價／公司價、保固月數、安全庫存、是否需要序號
- **客戶／供應商**：一般消費者與公司行號、統編、聯絡資料、交易紀錄
- **進貨**：輸入或掃描序號、自動更新庫存與平均成本
- **銷貨**：直接掃描序號開單、公司客戶自動帶公司價與統編、5% 稅額計算、月結、列印
- **庫存**：即時庫存、低庫存提醒、庫存價值、列印盤點表、庫存調整（附原因）
- **序號查詢**：查保固狀態、進貨來源、賣給哪位客戶
- 每一筆庫存變動都有紀錄可追查；多人同時開單也不會超賣

手機可在瀏覽器選單中「加入主畫面」，當作 App 使用。

## 技術架構

Next.js 15 · PostgreSQL · Drizzle ORM · Tailwind CSS

## 上線步驟（建議：Neon 資料庫 + Vercel，初期免費）

1. **建立資料庫**：到 [neon.tech](https://neon.tech) 註冊並建立專案，複製連線字串（`postgresql://...`）。
2. **部署網站**：到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入 →「Add New Project」→ 選擇 `MERIT-ERP`。
3. 在 Vercel 的 **Environment Variables** 加入：
   - `DATABASE_URL`：第 1 步的連線字串
   - `AUTH_SECRET`：至少 32 字元的隨機字串
   - `SEED_ADMIN_PASSWORD`：老闆帳號 admin 的初始密碼（至少 8 字元）
4. **建立資料表與老闆帳號**：Vercel 部署時會自動執行（使用 `vercel-build`），第一次部署前請在環境變數加上 `SEED_ADMIN_PASSWORD`。若要手動執行：
   ```bash
   npm install
   cp .env.example .env   # 填入 DATABASE_URL、AUTH_SECRET、SEED_ADMIN_PASSWORD
   npm run db:migrate
   npm run db:seed
   ```
5. 打開 Vercel 給的網址，用帳號 `admin` 登入，然後到「修改密碼」設定自己的密碼。

## 開發

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000
```

測試（會清空指定的資料庫，請使用獨立的測試資料庫）：

```bash
TEST_DATABASE_URL=postgresql://.../merit_test npm test
```

修改 `src/db/schema.ts` 後，執行 `npm run db:generate` 產生遷移檔，再 `npm run db:migrate`。
