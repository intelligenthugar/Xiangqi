# 中國象棋 Xiangqi（Firebase 多人連線版）

保留原本象棋網站的深色預設、木質棋盤、兩側春聯、紅黑棋子、AI 戰績與單機／同裝置雙人模式，新增 Firebase 匿名登入與房間代碼連線。

## 檔案

- `index.html`：遊戲大廳
- `chess.html`：棋盤與多人房間 UI
- `css/style.css`：整體樣式
- `js/home.js`：大廳主題與語言切換
- `js/chess.js`：棋規、AI、房間建立／加入／同步
- `js/firebase-config.js`：你的 Firebase 網頁設定（需要自行填入）
- `database.rules.json`：Realtime Database 規則範例

## 先設定 Firebase

1. Firebase Console → Authentication → Sign-in method，啟用 **Anonymous（匿名）**。
2. Firebase Console → Realtime Database，確認資料庫已建立。
3. 開啟 `js/firebase-config.js`，把 `YOUR_API_KEY`、`YOUR_PROJECT_ID`、`YOUR_DATABASE_NAME...` 等範例字串換成 Firebase 專案設定裡的真實值。`databaseURL` 必須完整照抄 Realtime Database 頁面上的網址。
4. Firebase Console → Realtime Database → Rules，把 `database.rules.json` 的內容貼入並發布。
5. 把整個資料夾內容上傳至 GitHub repository，保持資料夾結構不變，再由 GitHub Pages 開啟網站。

## 使用方式

- 首頁按「單機版」即可玩 AI。
- 首頁按「多人連線」後，先由一方按「建立房間」，把 6 碼代碼傳給朋友；另一方輸入代碼按「加入房間」。建立者是紅方，加入者是黑方。
- 兩位玩家都必須使用已部署的 HTTPS 網址；不能用檔案總管直接雙擊 HTML 測試 Firebase 模組。

## 安全注意

此專案是教學用多人連線原型。範例規則限制匿名登入者、房間成員與輪到的玩家，但 Realtime Database 規則無法單靠目前這份前端程式完整驗證象棋每一步是否合法；不要把它當成具備伺服器端反作弊能力的正式競技平台。若要公開給陌生人長期使用，應加上伺服器端驗證、房間逾時清理、重連／離房處理與更嚴格的規則測試。
