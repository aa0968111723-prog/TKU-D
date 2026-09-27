# TKU EduPsy AI Research OS

淡江大學教育心理與諮商研究所研究生的研究室。不是聊天框，也不是校園宣傳頁。

## 跑起來

需要 Node.js 22 以上。

```bash
cp .env.example .env
npm install
npm run dev
```

打開 http://localhost:3000 。淡江公開的 SSO 是 IBM WebSEAL，沒有對第三方公開 OIDC client。沒有學校核發的 issuer 與 client 時，「使用淡江 SSO 登入」會說明原因，不會假裝登入成功，也不會收下校務密碼。本機可用「其他登入方式」的開發帳號。

AI 預設走本機 Hermes proxy，由它掛上 xAI Grok OAuth：

```bash
npm run ai-proxy
```

這會執行 `hermes proxy start --provider xai --port 8645`。沒有這支 proxy、也沒有 `XAI_API_KEY` 時，筆記、課程、待辦、統計計算仍然可用；需要模型的動作會明白說連不上，不會編答案。

## 已經接上的能力

- 登入 adapter：淡江 OIDC（取得授權後填 `.env`）、Google、信箱連結、開發帳號
- 今天、快速捕捉、課程、筆記、待辦、行事曆、討論、靈感
- 研究計畫、研究問題版本、論文 15 個階段
- PDF / DOCX / PPTX / CSV / 圖片上傳、DOI 對 Crossref 與 OpenAlex、APA 7；對不到就寫「未找到可靠來源」
- 文獻比較矩陣、知識圖、全文與 trigram 搜尋、文獻片段檢索
- 研究貓對話：Hermes / Grok，回答分成原始資料、整理、推論、待確認
- 統計由本機計算；質性編碼分研究者與 AI 建議，原始逐字稿不改
- Google Drive、Calendar、Gmail 草稿、Zotero、教心所頁面同步
- 敏感資料預設不進一般 AI 上下文

## 部署

`docker compose up --build`。資料在 volume。正式環境請設定 `AUTH_SECRET`，並只在你接受風險時才打開 `AUTH_DEV_LOGIN`。

AI 若跑在宿主機的 Hermes proxy，容器要用 `AI_BASE_URL=http://host.docker.internal:8645/v1`。
