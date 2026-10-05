# KAKIN ROYAL ARCHIVE｜01 × 04

卡金王室外流機密檔案風格的非官方同人創作網站。黑色介面，支援人物簡介、插圖、漫畫、小說與番外小說。

## 放到 GitHub

解壓縮 ZIP，建立你的 GitHub repository，將 `kakin-royal-archive` 資料夾內的全部內容上傳。請保留 `.gitignore` 與 `.env.example`。

匯出包含完整原始碼、目前已發布的作品資料、LOGO 與建置產物。不包含登入密碼、密鑰、Git 歷史或目前瀏覽器內未匯出的草稿。瀏覽器草稿請另外登入網站，按「匯出更新檔」備份。

上傳到 GitHub 是保存原始碼；若要讓讀者在網址上使用網站，還需要部署。

## 檔案結構

| 路徑 | 內容 |
| --- | --- |
| `public/index.html` | 網頁入口與網站資訊 |
| `public/app.js` | 入口、分類、閱讀頁與登入頁 |
| `public/style.css` | 黑色介面、紅色印章與手機排版 |
| `public/content.json` | 已發布作品資料 |
| `public/assets/logo.svg` | 預設 LOGO 圖片 |
| `private/editor.js` | 編輯介面、上傳、漫畫排序、LOGO 更換與匯出 |
| `worker/index.mjs` | 網站端帳密驗證、登入 Cookie 與檔案服務 |
| `scripts/build.mjs` | 建置程式 |
| `dist/server/index.js` | 已建置完成、內含所有資源的 Worker |
| `.env.example` | 登入設定的空白範本 |
| `.openai/hosting.json` | 原 Sites 網站識別資料，不含密鑰 |

## 建置

使用 Node.js 24 或更新版本，在專案資料夾執行：

```sh
npm run check
npm run build
```

沒有第三方 npm 相依套件，不需要先執行 `npm install`。輸出是 `dist/server/index.js`，提供標準 Worker `fetch(request, env)` 介面。

## 部署與帳密

完整網站包含網站端帳密驗證，需在支援 Cloudflare Workers 的環境執行。**純靜態 GitHub Pages 無法執行這個版本的登入保護。**

在新的部署環境設定以下變數。敏感值應設為 secrets，不能提交到 GitHub：

| 變數 | 用途 |
| --- | --- |
| `ADMIN_USERNAME` | 作者登入帳號 |
| `ADMIN_SALT` | 隨機 16 bytes，轉為 32 位十六進位字串 |
| `ADMIN_PASSWORD_HASH` | PBKDF2-HMAC-SHA256 密碼結果：100000 次、32 bytes，轉為十六進位字串 |
| `ADMIN_SESSION_SECRET` | 至少 40 字元的高強度隨機登入簽章密鑰 |
| `ADMIN_ORIGIN` | 網站來源，例如 `https://your-domain.example`，不加尾端斜線 |

可使用以下 Python 程式產生新部署需要的設定。程式會要求輸入你選的新密碼，然後在本機顯示設定值。把它們存入部署平台的設定，不要寫入原始碼：

```python
import getpass
import hashlib
import secrets

password = getpass.getpass('新登入密碼：')
salt = secrets.token_hex(16)
print('ADMIN_SALT=' + salt)
print('ADMIN_PASSWORD_HASH=' + hashlib.pbkdf2_hmac(
    'sha256', password.encode('utf-8'), bytes.fromhex(salt), 100000
).hex())
print('ADMIN_SESSION_SECRET=' + secrets.token_urlsafe(48))
```

另行設定帳號 `ADMIN_USERNAME` 與網站來源 `ADMIN_ORIGIN`。原 Sites 網站的密鑰由原部署環境管理，不在 ZIP 裡；搬到其他環境時需要設定自己的登入資料。

登入入口是右下角淡灰色 **EDIT**，也可使用 `/#login`。登入有效期四小時，編輯程式需通過網站端驗證才會提供。

## 更新作品與 LOGO

1. 按 `EDIT` 並登入。
2. 新增或編輯作品，或按「更換 LOGO」。
3. 儲存草稿並預覽。
4. 按「匯出更新檔」。
5. 把匯出 JSON 的完整內容放入 `public/content.json`，重新建置並部署。

更新檔含作品與上傳圖片；自訂 LOGO 位於 `settings.logo`。作品圖片單張最多 10 MB，LOGO 最多 2 MB。LOGO 支援 PNG、JPG、WebP。

草稿保存在目前瀏覽器的 IndexedDB，讀者看到的是已部署的資料。清除瀏覽器資料可能刪除草稿，請定期匯出備份。這個版本不使用雲端資料庫，編輯頁儲存草稿不會直接發布作品。

## 創作聲明

歡迎轉載 內容部分由AI生成  
非官方同人創作

本網站與原作、作者及出版社無關。此專案未另外授予原作角色、名稱或第三方作品的使用權。
