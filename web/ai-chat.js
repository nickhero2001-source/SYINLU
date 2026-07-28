/* =========================================================
   幸福+工場 · AI 採購顧問（浮動客服元件）
   -----------------------------------------------------------
   模組化重點：
   - 不修改既有版型/商品頁/動畫，僅在 <body> 結尾附加獨立元件
   - 所有邏輯包在 IIFE 內，避免污染全域變數（僅暴露 window.AIConcierge）
   - sendToAI() 為統一的訊息處理入口，依序判斷：
       1) 使用者「自由輸入文字」且 window.USE_KNOWLEDGE_ENGINE === true
          → 優先交給 Knowledge Engine 搜尋 knowledge.json；
            找到答案就回覆並附上「查看更多」按鈕，
            找不到則顯示固定的「找不到相關資訊」訊息 —
            這個分支全程不會呼叫任何 AI／OpenAI。
       2) 其餘情況（快速選項點擊，或 Knowledge Engine 關閉時的文字輸入）：
          · window.USE_MOCK === true  → 使用 mock-ai.js 的假資料對話樹
          · window.USE_MOCK === false → 改用 window.aiService.sendMessage()
          · 若 aiService 發生任何錯誤，會自動 fallback 回 mock-ai.js，
            確保聊天室不會因為 AI Service 尚未就緒或未來串接 API
            發生問題而整個無法使用
   ========================================================= */

(function () {
  "use strict";

  // ---------- 對話狀態（僅存在於記憶體中，重新整理頁面會重置） ----------
  const state = {
    opened: false,
    firstOpen: true,
    quoteItem: null,
    quoteQty: null,
    quoteContact: null,
    awaitingContact: false,
    history: [] // { from: 'bot'|'user', text, cards, quickReplies }
  };

  // ---------- SVG Icons（沿用官網不使用外部圖示庫的作法） ----------
  const ICONS = {
    chat:
      '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.66 1.38 5.02 3.55 6.63-.12.99-.5 2.53-1.4 3.9-.14.22.05.5.3.45 2.02-.4 3.7-1.28 4.7-1.92.9.24 1.86.37 2.85.37 5.52 0 10-3.94 10-8.8C22 5.94 17.52 2 12 2z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12.01l6.3 6.3-1.42 1.41L10.59 13.4l-6.3 6.3-1.41-1.42 6.3-6.3-6.3-6.3L4.3 4.3l6.29 6.3 6.3-6.3z"/></svg>',
    send:
      '<svg viewBox="0 0 24 24"><path d="M3 20.5v-17l19 8.5-19 8.5zm2-3.02 12.6-5.48L5 6.52v4.4l7.5 1.08L5 13.08v4.4z"/></svg>'
  };

  // ---------- DOM 建立 ----------
  let root, fab, tooltip, win, body, input, sendBtn;

  function buildDOM() {
    root = document.createElement("div");
    root.id = "ai-concierge-root";

    root.innerHTML =
      '<div class="ac-tooltip" id="acTooltip">您好，我是幸福小管家 🌸<br>需要禮盒建議或採購協助嗎？</div>' +
      '<button class="ac-fab" id="acFab" aria-label="開啟 AI 採購顧問">' +
      '<span class="ac-fab-ring"></span>' +
      ICONS.chat +
      '<span class="ac-fab-badge"></span>' +
      "</button>" +
      '<div class="ac-window" id="acWindow" role="dialog" aria-label="AI 採購顧問聊天視窗">' +
      '  <div class="ac-header">' +
      '    <div class="ac-avatar">幸</div>' +
      '    <div class="ac-header-text">' +
      '      <div class="ac-header-title">幸福小管家 · AI 採購顧問</div>' +
      '      <div class="ac-header-sub"><span class="dot"></span>為您即時提供禮盒建議</div>' +
      "    </div>" +
      '    <button class="ac-close" id="acClose" aria-label="關閉聊天視窗">' + ICONS.close + "</button>" +
      "  </div>" +
      '  <div class="ac-body" id="acBody"></div>' +
      '  <div class="ac-footer">' +
      '    <input class="ac-input" id="acInput" type="text" placeholder="輸入您的問題...（例如：彌月禮盒推薦）" maxlength="200" />' +
      '    <button class="ac-send" id="acSend" aria-label="送出">' + ICONS.send + "</button>" +
      "  </div>" +
      '  <div class="ac-disclaimer">內容由 AI 模擬客服提供，僅供參考，正式報價以專屬服務員回覆為準</div>' +
      "</div>";

    document.body.appendChild(root);

    fab = root.querySelector("#acFab");
    tooltip = root.querySelector("#acTooltip");
    win = root.querySelector("#acWindow");
    body = root.querySelector("#acBody");
    input = root.querySelector("#acInput");
    sendBtn = root.querySelector("#acSend");
    const closeBtn = root.querySelector("#acClose");

    fab.addEventListener("click", toggleWindow);
    closeBtn.addEventListener("click", closeWindow);
    sendBtn.addEventListener("click", handleUserSubmit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleUserSubmit();
    });

    // 首次載入 3 秒後顯示提示泡泡，8 秒後自動淡出
    setTimeout(function () {
      if (!state.opened) tooltip.classList.add("show");
    }, 3000);
    setTimeout(function () {
      tooltip.classList.remove("show");
    }, 11000);
  }

  // ---------- 開關視窗 ----------
  function toggleWindow() {
    state.opened ? closeWindow() : openWindow();
  }

  function openWindow() {
    state.opened = true;
    win.classList.add("open");
    tooltip.classList.remove("show");

    if (state.firstOpen) {
      state.firstOpen = false;
      renderBotMessage(window.MockAI.getGreeting());
    }
    setTimeout(function () {
      input.focus();
    }, 200);
  }

  function closeWindow() {
    state.opened = false;
    win.classList.remove("open");
  }

  // ---------- 訊息渲染 ----------
  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }

  function renderUserMessage(text) {
    const row = document.createElement("div");
    row.className = "ac-row user";
    row.innerHTML = '<div class="ac-bubble"></div>';
    row.querySelector(".ac-bubble").textContent = text;
    body.appendChild(row);
    scrollToBottom();
  }

  function renderTyping() {
    const row = document.createElement("div");
    row.className = "ac-row bot";
    row.id = "acTypingRow";
    row.innerHTML = '<div class="ac-typing"><span></span><span></span><span></span></div>';
    body.appendChild(row);
    scrollToBottom();
    return row;
  }

  function renderBotMessage(msg) {
    // msg: { text, quickReplies, cards, moreUrl }
    const row = document.createElement("div");
    row.className = "ac-row bot";

    const bubble = document.createElement("div");
    bubble.className = "ac-bubble";
    bubble.textContent = msg.text;
    row.appendChild(bubble);
    body.appendChild(row);

    // 商品/方案卡片
    if (msg.cards && msg.cards.length) {
      msg.cards.forEach(function (card) {
        const cardRow = document.createElement("div");
        cardRow.className = "ac-row bot";
        const cardEl = document.createElement("div");
        cardEl.className = "ac-card";
        cardEl.style.maxWidth = "82%";
        cardEl.innerHTML =
          '<div class="ac-card-title"></div><div class="ac-card-desc"></div><div class="ac-card-price"></div>';
        cardEl.querySelector(".ac-card-title").textContent = card.title;
        cardEl.querySelector(".ac-card-desc").textContent = card.desc;
        cardEl.querySelector(".ac-card-price").textContent = card.price;
        cardRow.appendChild(cardEl);
        body.appendChild(cardRow);
      });
    }

    // 快速回覆按鈕 ＋「查看更多」連結按鈕（沿用同一排 chip 樣式，不新增 CSS）
    const hasQuickReplies = msg.quickReplies && msg.quickReplies.length;
    const hasMoreUrl = !!msg.moreUrl;
    if (hasQuickReplies || hasMoreUrl) {
      const qrWrap = document.createElement("div");
      qrWrap.className = "ac-quick-replies";

      if (hasQuickReplies) {
        msg.quickReplies.forEach(function (qr) {
          const chip = document.createElement("button");
          chip.className = "ac-chip";
          chip.textContent = qr.label;
          chip.addEventListener("click", function () {
            onQuickReply(qr.label, qr.payload);
          });
          qrWrap.appendChild(chip);
        });
      }

      if (hasMoreUrl) {
        const moreLink = document.createElement("a");
        moreLink.className = "ac-chip";
        moreLink.textContent = "查看更多 ↗";
        moreLink.href = msg.moreUrl;
        moreLink.target = "_blank";
        moreLink.rel = "noopener";
        qrWrap.appendChild(moreLink);
      }

      body.appendChild(qrWrap);
    }

    scrollToBottom();
    state.history.push({ from: "bot", text: msg.text });
  }

  // ---------- 使用者互動 ----------
  function onQuickReply(label, payload) {
    renderUserMessage(label);
    state.history.push({ from: "user", text: label });

    // 特殊連結類 payload：模擬開新分頁
    if (payload === "link:survey") {
      window.open("https://www.surveycake.com/s/xOYP9", "_blank", "noopener");
    } else if (payload === "link:line") {
      window.open("https://line.me/R/ti/p/@570brfxc/", "_blank", "noopener");
    }

    simulateThinking(function () {
      sendToAI({ type: "payload", value: payload, label: label })
        .then(function (reply) {
          renderBotMessage(reply);
        })
        .catch(function (err) {
          console.error("[AIConcierge] 訊息處理發生未預期錯誤：", err);
          renderBotMessage({ text: "不好意思，系統暫時無法回應，請稍後再試。", quickReplies: [], cards: [] });
        });
    });
  }

  function handleUserSubmit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    renderUserMessage(text);
    state.history.push({ from: "user", text: text });

    simulateThinking(function () {
      sendToAI({ type: "text", value: text })
        .then(function (reply) {
          renderBotMessage(reply);
        })
        .catch(function (err) {
          console.error("[AIConcierge] 訊息處理發生未預期錯誤：", err);
          renderBotMessage({ text: "不好意思，系統暫時無法回應，請稍後再試。", quickReplies: [], cards: [] });
        });
    });
  }

  function simulateThinking(callback) {
    sendBtn.disabled = true;
    const typingRow = renderTyping();
    const delay = 550 + Math.random() * 500;
    setTimeout(function () {
      typingRow.remove();
      sendBtn.disabled = false;
      callback();
    }, delay);
  }

  // =========================================================
  //  sendToAI()  —— 統一的訊息處理入口（Mock ↔ AI Service）
  // ---------------------------------------------------------
  //  輸入 { type: 'text'|'payload', value: string, label?: string }
  //  輸出 Promise<{ text: string, quickReplies?: [...], cards?: [...] }>
  //
  //  · window.USE_MOCK === true（預設）
  //      直接使用 mock-ai.js 的假資料對話樹（window.MockAI.respond）
  //  · window.USE_MOCK === false
  //      改用 window.aiService.sendMessage() 取得回覆，並將回傳格式
  //      轉換成 ai-chat.js 渲染邏輯需要的 { text, quickReplies, cards } 結構
  //  · 任何情況下 aiService 呼叫失敗（尚未載入／future API 錯誤等），
  //      一律 catch 起來並自動 fallback 回 mock-ai.js，
  //      確保聊天室不會整個無法使用
  //
  //  未來要正式串接 OpenAI／Claude API：
  //    不需要更動這支函式，只需要修改 /js/ai/ai-service.js 內的
  //    callAI()，把 Mock 回覆換成真正的 fetch() API 呼叫即可。
  // =========================================================
  async function sendToAI(input) {
    // 1) 使用者自由輸入文字 → 優先交給 Knowledge Engine（不呼叫任何 AI）
    if (input.type === "text" && window.USE_KNOWLEDGE_ENGINE) {
      return getKnowledgeReply(input.value);
    }

    // 2) 其餘情況：維持原本 Mock ↔ AI Service 的流程
    if (window.USE_MOCK) {
      return getMockReply(input);
    }

    try {
      if (!window.aiService || typeof window.aiService.sendMessage !== "function") {
        throw new Error("window.aiService 尚未就緒，請確認 /js/ai/ 相關檔案已於 ai-chat.js 之前載入");
      }

      // quick reply 的 payload（如 flow:gift）對 aiService 而言沒有意義，
      // 一律改用使用者實際看到、點擊的文字（label）作為訊息內容
      const messageForAI = input.type === "payload" ? input.label || input.value : input.value;

      const result = await window.aiService.sendMessage(messageForAI);

      if (!result || result.success !== true) {
        throw new Error("aiService 回傳失敗結果，自動切回 Mock 模式");
      }

      return adaptAIServiceResponse(result);
    } catch (err) {
      console.warn("[AIConcierge] aiService 呼叫失敗，自動切回 mock-ai.js：", err);
      return getMockReply(input);
    }
  }

  /**
   * 呼叫 Knowledge Engine 搜尋 knowledge.json 取得回覆。
   * 找到資料：回傳該筆 content，若有 url 則一併附上（供「查看更多」按鈕使用）。
   * 找不到資料：回傳固定的「找不到相關資訊」訊息。
   * 這兩種情況全程都不會呼叫任何 AI／OpenAI。
   * 僅在 Knowledge Engine 本身發生非預期錯誤（例如尚未載入）時，
   * 才 catch 起來改用同樣固定的訊息，確保聊天室不會中斷。
   * @param {string} query - 使用者輸入的文字
   * @returns {Promise<{text:string, quickReplies:Array, cards:Array, moreUrl:(string|null)}>}
   */
  async function getKnowledgeReply(query) {
    const FALLBACK_TEXT = "很抱歉，目前我沒有找到相關資訊。若您需要進一步協助，歡迎聯絡我們。";

    try {
      if (!window.knowledgeEngine || typeof window.knowledgeEngine.answer !== "function") {
        throw new Error("window.knowledgeEngine 尚未就緒，請確認 knowledge-engine.js 已於 ai-chat.js 之前載入");
      }
      const result = await window.knowledgeEngine.answer(query);
      return adaptKnowledgeResponse(result);
    } catch (err) {
      console.warn("[AIConcierge] Knowledge Engine 查詢發生錯誤，改用固定回覆：", err);
      return { text: FALLBACK_TEXT, quickReplies: [], cards: [], moreUrl: null };
    }
  }

  /**
   * 將 window.knowledgeEngine.answer() 的回傳格式
   * { found, title, content, url }
   * 轉換成 ai-chat.js 渲染邏輯所需的 { text, quickReplies, cards, moreUrl } 結構。
   * @param {{found:boolean, content:string, url:(string|null)}} result - Knowledge Engine 回傳結果
   * @returns {{text:string, quickReplies:Array, cards:Array, moreUrl:(string|null)}}
   */
  function adaptKnowledgeResponse(result) {
    return {
      text: result.content,
      quickReplies: [],
      cards: [],
      moreUrl: result.found && result.url ? result.url : null
    };
  }

  /**
   * 呼叫 mock-ai.js 取得假資料回覆（維持原本的對話樹行為）
   * @param {{type:string, value:string}} input - 使用者輸入
   * @returns {{text:string, quickReplies:Array, cards:Array}}
   */
  function getMockReply(input) {
    return window.MockAI.respond(input, state);
  }

  /**
   * 將 window.aiService.sendMessage() 回傳的統一格式
   * { success, reply, products, quickReply, form, context }
   * 轉換成 ai-chat.js 渲染邏輯所需的 { text, quickReplies, cards } 結構，
   * 讓畫面呈現方式完全不受影響。
   * @param {{reply:string, products:Array, quickReply:Array}} result - aiService 回傳結果
   * @returns {{text:string, quickReplies:Array, cards:Array}}
   */
  function adaptAIServiceResponse(result) {
    const quickReplies = Array.isArray(result.quickReply)
      ? result.quickReply.map(function (qr) {
          return { label: qr.title, payload: qr.value };
        })
      : [];

    const cards = Array.isArray(result.products)
      ? result.products.map(function (p) {
          return { title: p.name, desc: p.description, price: p.price };
        })
      : [];

    return { text: result.reply || "", quickReplies: quickReplies, cards: cards };
  }

  // ---------- 初始化 ----------
  function init() {
    if (!window.MockAI) {
      console.warn("[AIConcierge] 找不到 MockAI，請確認 mock-ai.js 已於本檔案之前載入");
      return;
    }
    buildDOM();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 暴露少量介面，方便除錯或未來擴充
  window.AIConcierge = {
    open: function () {
      openWindow();
    },
    close: closeWindow,
    sendToAI: sendToAI
  };
})();
