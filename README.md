# 中國象棋 Xiangqi｜GitHub Pages 多人連線原型版

## 本版功能

- 匿名登入玩家可設定暱稱，暱稱會顯示在房間中。
- 建立公開房間（登上公開列表）或私人房間（不登上列表）。
- 可為房間設定密碼；加入時需在房間頁輸入密碼。
- 同一瀏覽器重新整理後，會嘗試以 Firebase 保留的匿名 UID 恢復原本座位與棋局。
- 首頁顯示公開房間基本資訊：房號、房主暱稱、建立時間、狀態、人數、是否有密碼。
- 首頁右下角有管理員原型入口，密碼為 `prohaugar`，只能查看公開列表。
- 保留原本的 Firebase 連線、黑方棋盤視角、在線狀態與房間交易修正。

## 更新檔案

將 ZIP 內的 `index.html`、`chess.html`、`css/style.css`、`js/chess.js`、`js/home.js` 上傳到 GitHub 專案相同路徑。

**不要覆蓋 `js/firebase-config.js`**，保留你目前已經設定成功的 Firebase 設定。

## 重要：公開房間列表需要新增資料庫規則

本版不會放寬既有 `rooms` 規則，也沒有提供前端刪除房間的功能。公開列表會使用新的 `publicRooms` 節點，因此需在 Firebase Console → Realtime Database → Rules，將 `database.rules.public-lobby-merge-example.json` 裡的 `publicRooms` 區塊合併到你現有的 `rules` 物件內。

**不要直接用範例整份覆蓋你現在的 Rules。** 只新增 `publicRooms` 區塊，並保留現有 `rooms` 規則。該區塊只允許登入使用者讀取；建立索引時會檢查房主 UID；更新只允許房主或黑方；規則要求 `newData.exists()`，因此不允許透過此區塊刪除索引。

若不新增這個規則，網站仍可使用房號建立／加入房間，但公開房間列表會顯示讀取權限錯誤，公開房間也無法登上列表。

## 原型版安全限制（請務必閱讀）

1. `prohaugar` 是寫在 `js/home.js` 的前端密碼。任何人都能查看下載的 JavaScript，因此這**不是安全的管理員驗證**；不要把它當成正式管理員登入。
2. 管理員頁只顯示 `publicRooms` 公開索引，不能列出所有私人房間，也不提供刪除房間功能。真正的管理員刪除必須由可信任的後端驗證管理員身分後執行。
3. 房間密碼在前端以 SHA-256 摘要形式存放，但房間讀取權限仍由 Firebase Rules 決定。因為這是純 GitHub Pages 原型，密碼不能當作真正的存取控制；知道房號且能讀取資料庫的使用者，仍可能繞過前端檢查。
4. 重新連線依賴同一瀏覽器仍保留 Firebase 匿名登入資料。如果使用者清除網站資料、換瀏覽器或裝置，匿名 UID 會不同，不能自動認回原座位。
5. 本版不包含伺服器定時工作，所以無法保證兩位玩家都離線 10 分鐘後自動刪除房間。要可靠執行，需要 Cloud Functions 或其他伺服器端工作。
6. 前端只能檢查棋局流程，不能取代伺服器端防作弊驗證。

## Firebase 基本設定

- Authentication → Sign-in method：啟用 Anonymous。
- Authentication → Settings → Authorized domains：加入你的 GitHub Pages 網域。
- 保留原本的 `js/firebase-config.js`。
- 使用 GitHub Pages 的 HTTPS 網址測試，不要用 `file://` 直接開啟。

## 測試順序

1. 先用一台裝置建立公開無密碼房間，確認首頁公開列表出現房號。
2. 另一台裝置從列表進入，確認能加入並同步棋步。
3. 測試有密碼房間：錯誤密碼應被前端拒絕，正確密碼可加入（這是原型層級檢查）。
4. 建立房間後重新整理頁面，確認仍能恢復同一個紅方或黑方座位。
5. 建立私人房間，確認它不出現在公開列表，但仍可使用房號加入。
