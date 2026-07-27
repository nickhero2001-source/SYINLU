/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— AI 服務層 (AI Service Layer)
 * ---------------------------------------------------------
 *  用途：
 *    AIService 是整個 AI 架構的入口，負責：
 *      ✔ 管理 Prompt（結合 window.AI_PROMPT）
 *      ✔ 管理知識庫（讀取 window.AI_KNOWLEDGE）
 *      ✔ 管理聊天紀錄（透過 ConversationManager + localStorage）
 *      ✔ 呼叫 AI（目前為 Mock，未來可替換為真實 API）
 *      ✔ 回傳統一格式的資料給呼叫端（例如 ai-chat.js）
 *
 *  職責邊界（重要）：
 *    AIService 完全不操作 DOM、不負責畫面渲染。
 *    UI 呈現一律交給 ai-chat.js 處理；AIService 只回傳資料。
 *
 *  依賴檔案（需在本檔案「之前」載入）：
 *    - config.js               (window.AI_CONFIG / window.AI_STATUS)
 *    - prompt.js                (window.AI_PROMPT)
 *    - knowledge.js              (window.AI_KNOWLEDGE)
 *    - conversation-manager.js   (window.ConversationManager)
 *
 *  未來串接真實 AI 服務時：
 *    只需要改寫 callAI() 內部邏輯（改為 fetch 真實 API），
 *    以及視需要實作 sendToOpenAI() / sendToGemini() /
 *    sendToClaude() / sendToLocalModel()，其餘架構、資料格式、
 *    呼叫方式（window.aiService.sendMessage(...)）皆不需更動。
 * =========================================================
 */

class AIService {
  /**
   * 建立 AI 服務層實例
   * 建構子僅負責初始化基本屬性，實際的歷史紀錄讀取由 init() 執行，
   * 以便未來若 init() 需要改為非同步（例如遠端載入知識庫）時，
   * 不會影響到建構子的呼叫時機。
   */
  constructor() {
    /**
     * 對話狀態管理器實例，負責聊天紀錄與多輪對話 context
     * @type {ConversationManager}
     */
    this.conversation =
      typeof ConversationManager !== "undefined" ? new ConversationManager() : null;

    /**
     * localStorage 儲存聊天紀錄用的 key
     * @type {string}
     */
    this.HISTORY_KEY = "happyplus_ai_history";

    /**
     * localStorage 儲存企業採購／多輪對話 context 用的 key
     * @type {string}
     */
    this.CONTEXT_KEY = "happyplus_ai_context";

    /**
     * 是否已完成初始化（避免重複 init）
     * @type {boolean}
     */
    this._initialized = false;
  }

  // =========================================================
  //  初始化
  // =========================================================

  /**
   * 初始化 AI 服務層。
   * 會嘗試從 localStorage 還原先前的聊天紀錄與企業採購 context，
   * 並將 window.AI_STATUS.online 設為 true 表示服務已就緒。
   * 此方法可安全地被重複呼叫（第二次之後不會重複還原資料）。
   * @returns {void}
   */
  init() {
    if (this._initialized) {
      this._debugLog("AIService 已經初始化過，略過重複初始化");
      return;
    }

    if (!this.conversation) {
      console.error(
        "[AIService] 找不到 ConversationManager，請確認 conversation-manager.js 已於 ai-service.js 之前載入"
      );
      return;
    }

    this.loadHistory();
    this._initialized = true;

    if (window.AI_STATUS) {
      window.AI_STATUS.online = true;
    }

    this._debugLog("AIService 初始化完成");
  }

  // =========================================================
  //  主要對外方法：sendMessage
  // =========================================================

  /**
   * 處理使用者傳入的一則訊息，並回傳 AI 回覆。
   *
   * 流程：
   *   1) 將使用者訊息加入聊天紀錄
   *   2) 組合 Prompt（buildPrompt）
   *   3) 取得相關知識庫內容（getKnowledge）
   *   4) 組合成標準 messages 陣列
   *   5) 呼叫 callAI() 取得回覆
   *   6) 將 AI 回覆加入聊天紀錄並寫入 localStorage
   *   7) 回傳統一格式的資料給呼叫端
   *
   * @param {string} message - 使用者輸入的文字
   * @returns {Promise<{success:boolean, reply:string, products:Array, quickReply:Array, form:(Object|null), context:Object}>}
   */
  async sendMessage(message) {
    if (!this._initialized) this.init();

    // 防呆：訊息為空則直接回傳錯誤格式，不呼叫 AI
    if (!message || typeof message !== "string" || !message.trim()) {
      return this._buildErrorResponse("訊息內容不能為空，請重新輸入。");
    }

    try {
      if (window.AI_STATUS) {
        window.AI_STATUS.loading = true;
        window.AI_STATUS.typing = true;
      }

      // 1) 使用者訊息加入聊天紀錄
      this.conversation.append({ role: "user", content: message });

      // 2) 組合 Prompt
      const prompt = this.buildPrompt(message);

      // 3) 取得知識庫相關內容
      const knowledge = this.getKnowledge(message);

      // 4) 組合標準 messages 陣列（供未來真實 API 使用的格式）
      const messages = this._buildMessages(prompt, knowledge, message);

      // 5) 呼叫 AI（目前為 Mock）
      const aiResult = await this.callAI(messages);

      // 6) 將 AI 回覆加入聊天紀錄，並持久化
      if (aiResult && aiResult.success) {
        this.conversation.append({ role: "assistant", content: aiResult.reply });
      }
      this.saveHistory();

      // 7) 回傳統一格式（附上目前 context，方便 UI 或未來流程判斷）
      return this._normalizeResponse(aiResult);
    } catch (error) {
      console.error("[AIService] sendMessage 發生錯誤：", error);
      return this._buildErrorResponse("目前系統忙碌，請稍後再試。");
    } finally {
      if (window.AI_STATUS) {
        window.AI_STATUS.loading = false;
        window.AI_STATUS.typing = false;
      }
    }
  }

  // =========================================================
  //  callAI — 目前為 Mock，未來替換為真實 API 呼叫
  // =========================================================

  /**
   * 呼叫 AI 模型並取得回覆。
   *
   * 目前狀態：Mock 實作，直接回傳固定的展示用回覆，
   * 不會真的發送任何網路請求。
   *
   * 未來串接真實服務時，建議直接替換本方法內容為：
   *   const response = await fetch(OPENAI_API_ENDPOINT, { ...messages... });
   *   回傳格式維持一致：{ success, reply, products, quickReply, form }
   *
   * @param {Array<{role:string, content:string}>} messages - 標準訊息陣列（system/user/assistant）
   * @returns {Promise<{success:boolean, reply:string, products:Array, quickReply:Array, form:(Object|null)}>}
   */
  async callAI(messages) {
    this._debugLog("callAI() 目前為 Mock 模式，收到 messages：", messages);

    // 模擬網路延遲，讓未來替換為真實 API 時體驗一致
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      success: true,
      reply: "您好，目前 AI 為展示模式。",
      products: [],
      quickReply: [],
      form: null
    };
  }

  // =========================================================
  //  Prompt 組合
  // =========================================================

  /**
   * 依據使用者訊息與目前對話狀態，組合出完整的 Prompt 字串。
   * 目前僅回傳 window.AI_PROMPT 本身；未來可依 currentFlow
   * （例如企業採購模式）動態附加額外指示，或注入知識庫摘要。
   *
   * @param {string} userMessage - 使用者輸入的文字（保留參數以利未來擴充判斷邏輯）
   * @returns {string} 組合後的 Prompt 字串
   */
  buildPrompt(userMessage) {
    const basePrompt = typeof window.AI_PROMPT === "string" ? window.AI_PROMPT : "";
    // 保留 userMessage 參數位置，未來可依內容動態調整 prompt（例如切換企業採購語氣）
    void userMessage;
    return basePrompt;
  }

  // =========================================================
  //  知識庫存取
  // =========================================================

  /**
   * 依據使用者訊息，從知識庫中取出相關內容。
   * 目前知識庫為空陣列，此方法先回傳完整知識庫物件；
   * 未來知識庫內容變多之後，可在此加入關鍵字比對或向量搜尋，
   * 只回傳與使用者問題最相關的片段，避免 prompt 過長。
   *
   * @param {string} userMessage - 使用者輸入的文字
   * @returns {{products:Array, faq:Array, esg:Array, contact:Array}}
   */
  getKnowledge(userMessage) {
    void userMessage; // 保留參數，未來用於篩選相關知識
    return window.AI_KNOWLEDGE || { products: [], faq: [], esg: [], contact: [] };
  }

  // =========================================================
  //  聊天紀錄：LocalStorage 儲存 / 讀取 / 清除
  // =========================================================

  /**
   * 將目前的聊天紀錄與企業採購 context 寫入 localStorage。
   * 若瀏覽器不支援或發生例外（例如無痕模式限制），僅記錄警告，不拋出錯誤。
   * @returns {void}
   */
  saveHistory() {
    if (!this.conversation) return;
    try {
      const state = this.conversation.get();
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(state.history));
      localStorage.setItem(
        this.CONTEXT_KEY,
        JSON.stringify({ currentFlow: state.currentFlow, context: state.context })
      );
    } catch (error) {
      console.warn("[AIService] saveHistory 寫入 localStorage 失敗：", error);
    }
  }

  /**
   * 從 localStorage 讀取先前儲存的聊天紀錄與企業採購 context，
   * 並還原到 ConversationManager 中。若無資料或解析失敗，維持初始空狀態。
   * @returns {void}
   */
  loadHistory() {
    if (!this.conversation) return;
    try {
      const historyRaw = localStorage.getItem(this.HISTORY_KEY);
      const contextRaw = localStorage.getItem(this.CONTEXT_KEY);

      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const contextData = contextRaw ? JSON.parse(contextRaw) : null;

      this.conversation.set({
        history: Array.isArray(history) ? history : [],
        currentFlow: contextData && contextData.currentFlow ? contextData.currentFlow : "general",
        context: contextData && contextData.context ? contextData.context : {}
      });
    } catch (error) {
      console.warn("[AIService] loadHistory 讀取 localStorage 失敗，將使用空白對話：", error);
    }
  }

  /**
   * 清除聊天紀錄與企業採購 context，同時清空 localStorage 中對應的資料。
   * @returns {void}
   */
  clearHistory() {
    if (this.conversation) this.conversation.clear();
    try {
      localStorage.removeItem(this.HISTORY_KEY);
      localStorage.removeItem(this.CONTEXT_KEY);
    } catch (error) {
      console.warn("[AIService] clearHistory 清除 localStorage 失敗：", error);
    }
  }

  // =========================================================
  //  對話狀態存取（委派給 ConversationManager）
  // =========================================================

  /**
   * 取得目前完整對話狀態（聊天紀錄 + 流程 + context）
   * @returns {{history:Array, currentFlow:string, context:Object}}
   */
  getConversation() {
    return this.conversation ? this.conversation.get() : { history: [], currentFlow: "general", context: {} };
  }

  /**
   * 覆寫目前對話狀態（例如從外部還原資料時使用）
   * @param {{history?:Array, currentFlow?:string, context?:Object}} data - 欲設定的對話狀態
   * @returns {void}
   */
  setConversation(data) {
    if (this.conversation) this.conversation.set(data);
  }

  /**
   * 重置對話狀態為初始值（等同新的一次對話），
   * 並同步清除 localStorage 中的聊天紀錄。
   * @returns {void}
   */
  resetConversation() {
    this.clearHistory();
  }

  // =========================================================
  //  未來擴充保留：不同 AI 服務供應商的呼叫入口
  //  （目前皆為空實作，僅保留架構與命名，尚未串接任何服務）
  // =========================================================

  /**
   * 保留擴充：串接 OpenAI API。
   * @param {Array<{role:string, content:string}>} messages - 標準訊息陣列
   * @returns {Promise<Object|null>} 目前尚未實作，回傳 null
   */
  async sendToOpenAI(messages) {
    void messages;
    this._debugLog("sendToOpenAI() 尚未實作，此為未來擴充保留位置");
    return null;
  }

  /**
   * 保留擴充：串接 Google Gemini API。
   * @param {Array<{role:string, content:string}>} messages - 標準訊息陣列
   * @returns {Promise<Object|null>} 目前尚未實作，回傳 null
   */
  async sendToGemini(messages) {
    void messages;
    this._debugLog("sendToGemini() 尚未實作，此為未來擴充保留位置");
    return null;
  }

  /**
   * 保留擴充：串接 Anthropic Claude API。
   * @param {Array<{role:string, content:string}>} messages - 標準訊息陣列
   * @returns {Promise<Object|null>} 目前尚未實作，回傳 null
   */
  async sendToClaude(messages) {
    void messages;
    this._debugLog("sendToClaude() 尚未實作，此為未來擴充保留位置");
    return null;
  }

  /**
   * 保留擴充：串接本地端／私有部署模型（Local Model）。
   * @param {Array<{role:string, content:string}>} messages - 標準訊息陣列
   * @returns {Promise<Object|null>} 目前尚未實作，回傳 null
   */
  async sendToLocalModel(messages) {
    void messages;
    this._debugLog("sendToLocalModel() 尚未實作，此為未來擴充保留位置");
    return null;
  }

  // =========================================================
  //  內部工具方法（private helper，不對外暴露於文件註解中列舉）
  // =========================================================

  /**
   * 組合標準格式的 messages 陣列，供 callAI() 或未來真實 API 使用。
   * 格式比照 OpenAI Chat Completion 慣例：[{role, content}, ...]
   * @param {string} prompt - 系統提示詞（system prompt）
   * @param {Object} knowledge - 相關知識庫內容
   * @param {string} userMessage - 使用者本次輸入
   * @returns {Array<{role:string, content:string}>}
   * @private
   */
  _buildMessages(prompt, knowledge, userMessage) {
    const history = this.conversation ? this.conversation.getHistory() : [];

    const systemMessage = {
      role: "system",
      content: prompt + "\n\n【知識庫參考資料】\n" + JSON.stringify(knowledge)
    };

    // 將歷史紀錄轉換為標準格式（排除剛剛加入、稍後會再附加一次的當前使用者訊息）
    const historyMessages = history
      .slice(0, -1)
      .map((item) => ({ role: item.role, content: item.content }));

    return [systemMessage, ...historyMessages, { role: "user", content: userMessage }];
  }

  /**
   * 將 callAI() 回傳結果轉換為對外統一格式，並附上目前的 context。
   * @param {Object} aiResult - callAI() 的回傳結果
   * @returns {{success:boolean, reply:string, products:Array, quickReply:Array, form:(Object|null), context:Object}}
   * @private
   */
  _normalizeResponse(aiResult) {
    const context = this.conversation ? this.conversation.getContext() : {};

    if (!aiResult || aiResult.success !== true) {
      return this._buildErrorResponse(
        aiResult && aiResult.reply ? aiResult.reply : "目前系統忙碌，請稍後再試。"
      );
    }

    return {
      success: true,
      reply: aiResult.reply || "",
      products: Array.isArray(aiResult.products) ? aiResult.products : [],
      quickReply: Array.isArray(aiResult.quickReply) ? aiResult.quickReply : [],
      form: aiResult.form || null,
      context: context
    };
  }

  /**
   * 建立統一格式的錯誤回覆（success: false），供 sendMessage 內各種例外情況使用。
   * 依規範不得拋出例外（throw Error），一律以回傳值表示錯誤。
   * @param {string} reply - 要顯示給使用者的錯誤訊息
   * @returns {{success:boolean, reply:string, products:Array, quickReply:Array, form:null, context:Object}}
   * @private
   */
  _buildErrorResponse(reply) {
    const context = this.conversation ? this.conversation.getContext() : {};
    return {
      success: false,
      reply: reply || "目前系統忙碌，請稍後再試。",
      products: [],
      quickReply: [],
      form: null,
      context: context
    };
  }

  /**
   * 統一的除錯輸出，僅在 window.AI_CONFIG.DEBUG 為 true 時印出訊息。
   * @param {...*} args - 欲輸出的內容，用法同 console.log
   * @returns {void}
   * @private
   */
  _debugLog(...args) {
    if (window.AI_CONFIG && window.AI_CONFIG.DEBUG) {
      console.log("[AIService]", ...args);
    }
  }
}

// =========================================================
//  建立全域唯一實例，供 ai-chat.js 或未來其他模組呼叫使用
//  例如：window.aiService.sendMessage("彌月禮盒推薦")
// =========================================================
window.aiService = new AIService();
window.aiService.init();
