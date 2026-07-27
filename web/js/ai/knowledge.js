/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— 知識庫 (Knowledge Base)
 * ---------------------------------------------------------
 *  用途：
 *    集中存放 AI 回覆時可參考的商品資訊、常見問題、ESG 內容
 *    與聯絡資訊。目前刻意留空陣列，不寫死任何假資料，未來會
 *    由下列來源之一取代／填入：
 *      - Google Sheet（透過 Apps Script 或 API 匯出 JSON）
 *      - 靜態 JSON 檔案
 *      - 後端 API
 *
 *  注意：
 *    本檔案僅提供純資料，不得包含任何 DOM 操作或邏輯運算。
 *    未來若改為非同步載入（例如 fetch 遠端 JSON），建議在
 *    AIService.init() 中處理，載入完成後再覆寫此物件內容，
 *    避免其他模組直接依賴載入時序。
 * =========================================================
 */

/**
 * AI 知識庫
 * @typedef {Object} Product
 * @property {string} name        - 商品名稱
 * @property {string} price       - 價格說明
 * @property {string} description - 商品描述
 * @property {string} image       - 商品圖片網址
 * @property {string} url         - 商品詳細頁連結
 *
 * @typedef {Object} FaqItem
 * @property {string} question - 問題
 * @property {string} answer   - 解答
 *
 * @typedef {Object} EsgItem
 * @property {string} title   - ESG 重點標題
 * @property {string} content - 說明內容
 *
 * @typedef {Object} ContactItem
 * @property {string} label - 聯絡管道名稱（例如：電話、LINE、Email）
 * @property {string} value - 聯絡管道內容
 *
 * @typedef {Object} AIKnowledge
 * @property {Product[]} products - 商品清單（目前為空，待資料來源接入）
 * @property {FaqItem[]} faq      - 常見問題（目前為空，待資料來源接入）
 * @property {EsgItem[]} esg      - ESG 說明（目前為空，待資料來源接入）
 * @property {ContactItem[]} contact - 聯絡資訊（目前為空，待資料來源接入）
 */
window.AI_KNOWLEDGE = {
  products: [],
  faq: [],
  esg: [],
  contact: []
};
