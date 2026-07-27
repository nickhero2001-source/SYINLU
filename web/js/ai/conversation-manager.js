/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— 對話狀態管理器 (Conversation Manager)
 * ---------------------------------------------------------
 *  用途：
 *    集中管理「多輪對話」所需的所有狀態，包含：
 *      - 聊天紀錄（訊息陣列）
 *      - 目前對話流程（例如：一般諮詢 / 企業採購模式）
 *      - 企業採購相關資訊（公司名稱、聯絡人、Email、電話…）
 *      - 預算、數量、送禮對象、到貨日期等暫存欄位
 *
 *  職責邊界：
 *    ConversationManager 只負責「狀態的存取與操作」，
 *    不呼叫 AI、不操作 DOM、不寫入 localStorage。
 *    localStorage 的讀寫由 AIService 負責，
 *    ConversationManager 只需提供可序列化（JSON-friendly）的資料結構。
 * =========================================================
 */

class ConversationManager {
  /**
   * 建立一個新的對話狀態管理器
   * 初始狀態為空對話、一般諮詢流程、企業資訊全部未填。
   */
  constructor() {
    /**
     * 聊天紀錄，陣列中每一筆為 { role: 'user'|'assistant'|'system', content: string, timestamp: number }
     * @type {Array<{role:string, content:string, timestamp:number}>}
     */
    this.history = [];

    /**
     * 目前對話流程狀態
     * 可能值：'general'（一般諮詢）｜ 'corporate'（企業採購模式）
     * @type {string}
     */
    this.currentFlow = "general";

    /**
     * 企業採購與多輪對話所需的暫存欄位（context）
     * @type {Object}
     */
    this.context = {
      company: null, // 公司名稱
      contactName: null, // 聯絡人
      email: null, // Email
      phone: null, // 電話
      quantity: null, // 需求盒數
      budget: null, // 預算
      recipient: null, // 送禮對象
      deliveryDate: null // 希望到貨日
    };
  }

  // =========================================================
  //  聊天紀錄相關方法
  // =========================================================

  /**
   * 取得完整對話狀態（供 AIService 存取或序列化用）
   * @returns {{history: Array<Object>, currentFlow: string, context: Object}}
   */
  get() {
    return {
      history: this.history,
      currentFlow: this.currentFlow,
      context: this.context
    };
  }

  /**
   * 覆寫整個對話狀態（例如從 localStorage 還原資料時使用）
   * @param {{history?: Array<Object>, currentFlow?: string, context?: Object}} data - 欲還原的對話狀態
   * @returns {void}
   */
  set(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.history)) this.history = data.history;
    if (typeof data.currentFlow === "string") this.currentFlow = data.currentFlow;
    if (data.context && typeof data.context === "object") {
      this.context = Object.assign({}, this.context, data.context);
    }
  }

  /**
   * 清空對話狀態，回復到初始狀態（一般諮詢、無歷史紀錄、無企業資訊）
   * @returns {void}
   */
  clear() {
    this.history = [];
    this.currentFlow = "general";
    this.context = {
      company: null,
      contactName: null,
      email: null,
      phone: null,
      quantity: null,
      budget: null,
      recipient: null,
      deliveryDate: null
    };
  }

  /**
   * 新增一筆訊息到聊天紀錄尾端
   * @param {{role: 'user'|'assistant'|'system', content: string}} message - 欲加入的訊息
   * @returns {void}
   */
  append(message) {
    if (!message || !message.role || typeof message.content !== "string") return;
    this.history.push({
      role: message.role,
      content: message.content,
      timestamp: Date.now()
    });
  }

  /**
   * 更新對話狀態中的特定欄位（流程狀態或企業採購 context）
   * 使用「局部更新」的方式，只覆寫傳入的欄位，其餘欄位維持不變。
   * @param {{currentFlow?: string, context?: Object}} partial - 欲更新的部分欄位
   * @returns {void}
   */
  update(partial) {
    if (!partial || typeof partial !== "object") return;
    if (typeof partial.currentFlow === "string") {
      this.currentFlow = partial.currentFlow;
    }
    if (partial.context && typeof partial.context === "object") {
      this.context = Object.assign({}, this.context, partial.context);
    }
  }

  /**
   * 取得聊天紀錄陣列（純訊息，不含流程與 context）
   * @returns {Array<Object>}
   */
  getHistory() {
    return this.history;
  }

  /**
   * 取得目前企業採購／多輪對話用的 context 物件
   * @returns {Object}
   */
  getContext() {
    return this.context;
  }
}

// 掛載到全域，供 AIService 或未來其他模組建立實例使用
window.ConversationManager = ConversationManager;
