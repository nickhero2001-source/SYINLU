/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— 全域設定檔 (Config)
 * ---------------------------------------------------------
 *  用途：
 *    集中管理 AI 相關的設定值，分為兩組：
 *
 *    1) AI_CONFIG / AI_STATUS
 *       給 /js/ai/ai-service.js（AI Service 架構）使用，是「未來若要
 *       串接真正的 OpenAI／Claude／Gemini 對話能力」時的保留設定，
 *       目前聊天室的問答流程並不會呼叫這一組。
 *
 *    2) USE_KNOWLEDGE_ENGINE / KNOWLEDGE_JSON_URL
 *       給 /js/ai/knowledge-engine.js 使用，是目前聊天室「唯一」
 *       實際運作中的知識來源開關與設定。
 *
 *  注意：
 *    本檔案不得包含任何 DOM 操作，僅提供純設定資料。
 * =========================================================
 */

/**
 * AI 服務設定（保留給未來 AI Service／OpenAI 串接使用，目前未啟用）
 * @typedef {Object} AIConfig
 * @property {string} MODEL       - 預計使用的模型名稱（尚未串接，僅作為未來擴充欄位）
 * @property {string} API_KEY     - API 金鑰（目前留空，正式串接時由後端代理注入）
 * @property {number} TEMPERATURE - 生成溫度，數值越高回覆越有創意，越低越穩定保守
 * @property {number} MAX_TOKEN   - 單次回覆的最大 token 數量
 * @property {boolean} DEBUG      - 是否開啟除錯訊息（開發階段建議開啟；也控制 knowledge-engine.js 的除錯輸出）
 */
window.AI_CONFIG = {
  MODEL: "gpt-4.1-mini",
  API_KEY: "",
  TEMPERATURE: 0.4,
  MAX_TOKEN: 1000,
  DEBUG: true
};

/**
 * AI 即時狀態（保留給未來 AI Service／OpenAI 串接使用，目前未啟用）
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
 * 智慧知識搜尋引擎（Knowledge Engine）開關
 * -----------------------------------------------------------
 * true  → 聊天室的所有問答（自由輸入文字、知識類快速選項）一律交由
 *         Knowledge Engine 搜尋 knowledge.json；找到答案就直接回覆，
 *         找不到則顯示固定的「找不到相關資訊」訊息。全程不呼叫任何
 *         AI／OpenAI，這是目前聊天室唯一的知識來源。
 * false → 停用知識搜尋功能（例如維護 knowledge.json 期間），
 *         聊天室一律回覆固定的「找不到相關資訊」訊息，不會嘗試查詢。
 *
 * 注意：詢價流程（線上詢價）是獨立於 Knowledge Engine 的狀態機，
 * 不受此開關影響。
 * @type {boolean}
 */
window.USE_KNOWLEDGE_ENGINE = true;

/**
 * knowledge.json 的載入路徑（相對於網站根目錄）
 * @type {string}
 */
window.KNOWLEDGE_JSON_URL = "/knowledge.json";
