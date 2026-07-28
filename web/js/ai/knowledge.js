/**
 * =========================================================
 *  幸福+ AI 採購顧問 —— 智慧知識搜尋引擎 (Knowledge Engine)
 * ---------------------------------------------------------
 *  用途：
 *    載入 knowledge.json（由 Knowledge Builder 產生的網站知識庫），
 *    並依「keywords → title → content」的優先順序，
 *    搜尋出與使用者輸入最相關的一筆資料。
 *
 *  職責邊界（重要）：
 *    KnowledgeEngine 完全不呼叫任何 AI 服務（不呼叫 aiService、
 *    不呼叫 OpenAI），純粹是本地端的關鍵字比對搜尋引擎。
 *    若找不到相符資料，一律回傳固定的「找不到相關資訊」訊息，
 *    交由呼叫端（ai-chat.js）顯示並引導使用者留下聯絡資訊。
 *    本檔案也不操作 DOM，只回傳純資料。
 * =========================================================
 */

class KnowledgeEngine {
  /**
   * 建立知識搜尋引擎實例
   * @param {string} [jsonUrl] - knowledge.json 的載入路徑，預設讀取 window.KNOWLEDGE_JSON_URL 或 "/knowledge.json"
   */
  constructor(jsonUrl) {
    /**
     * knowledge.json 的載入路徑
     * @type {string}
     */
    this.jsonUrl = jsonUrl || window.KNOWLEDGE_JSON_URL || "/knowledge.json";

    /**
     * 知識庫資料（knowledge.json 解析後的陣列）
     * @type {Array<Object>}
     */
    this.data = [];

    /**
     * 是否已成功載入知識庫
     * @type {boolean}
     */
    this.loaded = false;

    /**
     * 載入中的 Promise（避免重複發送多次載入請求）
     * @type {Promise<boolean>|null}
     * @private
     */
    this._loadPromise = null;

    /**
     * 找不到答案時的固定回覆文字
     * @type {string}
     */
    this.NOT_FOUND_MESSAGE = "很抱歉，目前我沒有找到相關資訊。若您需要進一步協助，歡迎聯絡我們。";
  }

  // =========================================================
  //  載入 knowledge.json
  // =========================================================

  /**
   * 初始化並載入 knowledge.json。
   * 可安全地重複呼叫：若已經載入成功，直接回傳 true；
   * 若正在載入中，回傳同一個載入 Promise，避免重複發送請求。
   * @returns {Promise<boolean>} 是否成功載入知識庫
   */
  async init() {
    if (this.loaded) return true;
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = this._load();
    return this._loadPromise;
  }

  /**
   * 實際執行 knowledge.json 的 fetch 與解析。
   * 若載入失敗（網路錯誤、404、JSON 格式錯誤等），僅記錄警告，
   * 不拋出例外，讓聊天室仍可用「找不到資料」的方式正常運作。
   * @returns {Promise<boolean>}
   * @private
   */
  async _load() {
    try {
      const response = await fetch(this.jsonUrl);
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const json = await response.json();
      this.data = Array.isArray(json) ? json : [];
      this.loaded = true;
      this._debugLog("knowledge.json 載入成功，共 " + this.data.length + " 筆資料");
      return true;
    } catch (error) {
      console.warn("[KnowledgeEngine] 載入 knowledge.json 失敗，將視為找不到任何資料：", error);
      this.data = [];
      this.loaded = false;
      return false;
    }
  }

  // =========================================================
  //  搜尋邏輯：keywords → title → content
  // =========================================================

  /**
   * 依使用者輸入搜尋知識庫，回傳最符合的單筆資料（或 null）。
   * 搜尋優先順序：
   *   1) keywords 完全相符（最高優先，找到立即回傳）
   *   2) keywords 部分相符（取相符關鍵字最長者）
   *   3) title 部分相符
   *   4) content 部分相符
   * @param {string} query - 使用者輸入的文字
   * @returns {Object|null} 符合的知識庫項目，或 null（找不到）
   */
  search(query) {
    if (!query || typeof query !== "string") return null;
    const q = query.trim().toLowerCase();
    if (!q || !this.data.length) return null;

    // 1) & 2) keywords 搜尋（優先順序最高）
    const keywordMatch = this._searchByKeywords(q);
    if (keywordMatch) return keywordMatch;

    // 3) title 搜尋
    const titleMatch = this._searchByField(q, "title");
    if (titleMatch) return titleMatch;

    // 4) content 搜尋
    const contentMatch = this._searchByField(q, "content");
    if (contentMatch) return contentMatch;

    return null;
  }

  /**
   * 依 keywords 欄位搜尋。完全相符的關鍵字會直接短路回傳；
   * 若無完全相符，則在「部分相符」的候選中，選出相符關鍵字字數最長者
   * （字數越長代表關鍵字越具體，通常代表比對更準確）。
   * @param {string} q - 已轉為小寫並去除頭尾空白的查詢字串
   * @returns {Object|null}
   * @private
   */
  _searchByKeywords(q) {
    let best = null;
    let bestScore = 0;

    for (const entry of this.data) {
      if (!Array.isArray(entry.keywords)) continue;

      for (const rawKeyword of entry.keywords) {
        if (typeof rawKeyword !== "string" || !rawKeyword) continue;
        const keyword = rawKeyword.toLowerCase();

        // 完全相符：最高優先，直接回傳
        if (q === keyword) {
          return entry;
        }

        // 部分相符（使用者輸入包含關鍵字，或關鍵字包含使用者輸入）
        if (q.indexOf(keyword) !== -1 || keyword.indexOf(q) !== -1) {
          const score = keyword.length;
          if (score > bestScore) {
            bestScore = score;
            best = entry;
          }
        }
      }
    }

    return best;
  }

  /**
   * 依指定欄位（title 或 content）做子字串搜尋，
   * 取字串長度最長（代表比對範圍最完整）的一筆作為最佳結果。
   * @param {string} q - 已轉為小寫並去除頭尾空白的查詢字串
   * @param {"title"|"content"} field - 欲搜尋的欄位名稱
   * @returns {Object|null}
   * @private
   */
  _searchByField(q, field) {
    let best = null;
    let bestScore = 0;

    for (const entry of this.data) {
      const value = entry[field];
      if (typeof value !== "string" || !value) continue;

      const valueLower = value.toLowerCase();
      if (valueLower.indexOf(q) !== -1) {
        const score = q.length;
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      }
    }

    return best;
  }

  // =========================================================
  //  對外主要入口：answer()
  // =========================================================

  /**
   * 依使用者輸入回傳統一格式的答案。
   * 找到資料時回傳該筆的 content 與 url；
   * 找不到資料時回傳固定的「找不到相關資訊」訊息，url 為 null。
   * 全程不呼叫任何 AI 服務。
   * @param {string} query - 使用者輸入的文字
   * @returns {Promise<{found:boolean, title:(string|null), content:string, url:(string|null)}>}
   */
  async answer(query) {
    await this.init();

    const entry = this.search(query);

    if (entry) {
      this._debugLog("命中知識庫：" + entry.id + " - " + entry.title);
      return {
        found: true,
        title: entry.title || null,
        content: entry.content || this.NOT_FOUND_MESSAGE,
        url: entry.url || null
      };
    }

    this._debugLog("查無符合資料：" + query);
    return {
      found: false,
      title: null,
      content: this.NOT_FOUND_MESSAGE,
      url: null
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
      console.log("[KnowledgeEngine]", ...args);
    }
  }
}

// =========================================================
//  建立全域唯一實例，供 ai-chat.js 或未來其他模組呼叫使用
//  例如：const result = await window.knowledgeEngine.answer("運費怎麼算");
// =========================================================
window.knowledgeEngine = new KnowledgeEngine();
window.knowledgeEngine.init();

