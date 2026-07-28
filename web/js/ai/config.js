/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— 全域設定檔 (Config)
 * ---------------------------------------------------------
 *  用途：
 *    集中管理 AI 服務層所需的設定值，例如未來要串接的
 *    模型名稱、API Key、生成參數等。目前 API_KEY 刻意留空，
 *    待正式串接 OpenAI / Claude / Gemini 等服務時再由後端
 *    或環境變數注入，切勿把真實金鑰寫死在前端程式碼中。
 *
 *  注意：
 *    本檔案不得包含任何 DOM 操作，僅提供純設定資料。
 * =========================================================
 */

/**
 * AI 服務設定
 * @typedef {Object} AIConfig
 * @property {string} MODEL       - 預計使用的模型名稱（尚未串接，僅作為未來擴充欄位）
 * @property {string} API_KEY     - API 金鑰（目前留空，正式串接時由後端代理注入）
 * @property {number} TEMPERATURE - 生成溫度，數值越高回覆越有創意，越低越穩定保守
 * @property {number} MAX_TOKEN   - 單次回覆的最大 token 數量
 * @property {boolean} DEBUG      - 是否開啟除錯訊息（開發階段建議開啟）
 */
window.AI_CONFIG = {
  MODEL: "gpt-4.1-mini",
  API_KEY: "",
  TEMPERATURE: 0.4,
  MAX_TOKEN: 1000,
  DEBUG: true
};

/**
 * AI 即時狀態
 * 提供給未來 UI 層讀取，用來顯示「載入中」「輸入中」「上線中」等狀態指示。
 * 本檔案僅負責宣告與初始化，實際狀態切換由 AIService 在呼叫流程中更新。
 * @typedef {Object} AIStatus
 * @property {boolean} loading - 是否正在等待 AI 服務回應（例如 fetch 尚未完成）
 * @property {boolean} typing  - 是否正在模擬/顯示「對方輸入中」的狀態
 * @property {boolean} online  - AI 服務目前是否可用
 */
window.AI_STATUS = {
  loading: false,
  typing: false,
  online: true
};

/**
 * 聊天室資料來源開關（Mock ↔ AI Service 切換）
 * -----------------------------------------------------------
 * true  → 聊天室使用 mock-ai.js 的假資料對話樹（目前預設）
 * false → 聊天室改用 window.aiService.sendMessage() 取得回覆
 *
 * 使用情境：
 *   - 開發/展示階段，想維持現有的假資料對話流程 → 保持 true
 *   - 想測試 AI Service 架構（目前 callAI() 內部仍是 Mock，
 *     之後會替換為真正的 OpenAI API）→ 改成 false
 *
 * 注意：即使設為 false，一旦 aiService 呼叫失敗（例如尚未載入、
 * 或未來串接真實 API 時發生網路錯誤），ai-chat.js 會自動切回
 * mock-ai.js，確保聊天室不會整個掛掉。
 * @type {boolean}
 */
window.USE_MOCK = true;

/**
 * 智慧知識搜尋引擎（Knowledge Engine）開關
 * -----------------------------------------------------------
 * true  → 使用者於聊天室輸入的文字訊息，優先交由 Knowledge Engine
 *         搜尋 knowledge.json，找到答案就直接回覆，找不到則顯示
 *         固定的「找不到相關資訊」訊息，全程不呼叫任何 AI／OpenAI。
 * false → 略過 Knowledge Engine，文字訊息改走原本的
 *         mock-ai.js／aiService 流程（依 window.USE_MOCK 決定）。
 *
 * 注意：此開關只影響「使用者自由輸入文字」的訊息；
 * 聊天室的快速選項（quick reply／選單按鈕）點擊仍走原本的
 * mock-ai.js 對話樹，不受此開關影響。
 * @type {boolean}
 */
window.USE_KNOWLEDGE_ENGINE = true;

/**
 * knowledge.json 的載入路徑（相對於網站根目錄）
 * @type {string}
 */
window.KNOWLEDGE_JSON_URL = "/knowledge.json";

