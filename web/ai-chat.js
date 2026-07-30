/* =========================================================
   幸福+工場 · AI 採購顧問（浮動客服元件）
   -----------------------------------------------------------
   架構重構說明（Mock AI 已完全移除）：
   - 不修改既有版型/商品頁/動畫，僅在 <body> 結尾附加獨立元件
   - 所有邏輯包在 IIFE 內，避免污染全域變數（僅暴露 window.AIConcierge）
   - 全站只有「一套知識來源」：knowledge.json → knowledge-engine.js。
     所有商品、FAQ、ESG、企業採購相關的「內容」一律來自 Knowledge Engine
     的搜尋結果，本檔案不寫死任何商品/FAQ/ESG 內容。
     （選單按鈕上的文字如「婚禮喜餅」只是導覽用的 UI 標籤，
       點擊後一律送進 Knowledge Engine 搜尋，不是資料本身）

   訊息流程（依規格簡化）：
     使用者輸入文字      → sendToAI() → Knowledge Engine → 回答
     Quick Reply（知識類）→ sendToAI() → Knowledge Engine → 回答
     Quick Reply（詢價類）→ 詢價流程（本檔案內建的獨立狀態機）→ 完成摘要
     Quick Reply（選單/連結類）→ 直接處理，不經過 sendToAI()

   sendToAI() 不再有任何 Mock fallback，也不呼叫 aiService/OpenAI；
   若 Knowledge Engine 發生非預期錯誤，一律回覆固定的
   「很抱歉，目前我沒有找到相關資訊」訊息。

   註：/js/ai/ai-service.js（含 OpenAI 串接的保留架構）目前仍會被
   index.html 載入，但本檔案已不再呼叫它——那是刻意保留給「未來若要
   加入真正的 AI 對話能力」時使用的獨立備用架構，與目前的知識庫問答
   流程無關，不屬於本次要清除的 Mock 架構。
   ========================================================= */

(function () {
  "use strict";

  // ---------- 找不到答案時的固定回覆（需與 knowledge-engine.js 保持一致） ----------
  const NOT_FOUND_TEXT = "很抱歉，目前我沒有找到相關資訊。若您需要進一步協助，歡迎聯絡我們。";

  // ---------- 外部連結（僅為導轉用途，非知識內容） ----------
  const LINKS = {
    survey: "https://www.surveycake.com/s/xOYP9",
    line: "https://line.me/R/ti/p/@570brfxc/"
  };

  // ---------- 對話狀態（僅存在於記憶體中，重新整理頁面會重置） ----------
  const state = {
    opened: false,
    firstOpen: true,
    // 詢價流程專屬的獨立狀態機，與 Knowledge Engine 完全分離
    quote: {
      active: false,
      step: null, // 'item' | 'qty' | 'contact' | null
      item: null,
      qty: null,
      contact: null
    }
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
      '  <div class="ac-disclaimer">內容由 AI 客服提供，僅供參考，正式報價以專屬服務員回覆為準</div>' +
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

    // 首次載入 3 秒後顯示提示泡泡，11 秒後自動淡出
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
      renderMenu();
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

  /**
   * 渲染一則機器人訊息（文字＋可選的快速回覆按鈕／商品卡片／查看更多連結）
   * @param {{text:string, quickReplies?:Array<{label:string,payload:string}>, cards?:Array, moreUrl?:(string|null)}} msg
   * @returns {void}
   */
  function renderBotMessage(msg) {
    const row = document.createElement("div");
    row.className = "ac-row bot";

    const bubble = document.createElement("div");
    bubble.className = "ac-bubble";
    bubble.textContent = msg.text;
    row.appendChild(bubble);
    body.appendChild(row);

    // 商品/方案卡片（目前僅預留渲染能力，內容一律來自呼叫端傳入的資料，不在此處寫死）
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
  }

  // =========================================================
  //  主選單 ／ FAQ 選單（純 UI 導覽，按鈕文字非知識內容）
  // =========================================================

  /**
   * 顯示主選單。所有選項點擊後都會導向 Knowledge Engine 搜尋，
   * 「線上詢價」則導向獨立的詢價流程，皆不寫死任何商品/FAQ/ESG 內容。
   * @returns {void}
   */
  function renderMenu() {
    renderBotMessage({
      text: "您好，我是幸福+工場的 AI 採購顧問 ✨\n很高興為您服務！請問今天想了解：",
      quickReplies: [
        { label: "💍 婚禮喜餅", payload: "kb:婚禮喜餅" },
        { label: "👶 彌月禮盒", payload: "kb:彌月禮盒" },
        { label: "🏢 企業採購", payload: "kb:企業採購" },
        { label: "🌱 ESG 說明", payload: "kb:ESG" },
        { label: "❓ 常見問題", payload: "menu:faq" },
        { label: "💬 線上詢價", payload: "quote:start" }
      ]
    });
  }

  /**
   * 顯示 FAQ 選單。問題清單「即時」從 knowledgeEngine 已載入的
   * knowledge.json 資料中篩選 type === "FAQ" 動態產生，
   * 不在程式碼中寫死任何一題 FAQ。
   * @returns {Promise<void>}
   */
  async function renderFaqMenu() {
    try {
      if (!window.knowledgeEngine || typeof window.knowledgeEngine.init !== "function") {
        throw new Error("window.knowledgeEngine 尚未就緒");
      }
      await window.knowledgeEngine.init();

      const faqEntries = (window.knowledgeEngine.data || []).filter(function (entry) {
        return entry && entry.type === "FAQ" && typeof entry.title === "string";
      });

      if (!faqEntries.length) {
        renderBotMessage({
          text: NOT_FOUND_TEXT,
          quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }]
        });
        return;
      }

      const quickReplies = faqEntries.map(function (entry) {
        return { label: entry.title, payload: "kb:" + entry.title };
      });
      quickReplies.push({ label: "🔙 返回主選單", payload: "menu:main" });

      renderBotMessage({
        text: "常見問題，請點選您想了解的項目：",
        quickReplies: quickReplies
      });
    } catch (err) {
      console.warn("[AIConcierge] 載入 FAQ 選單失敗：", err);
      renderBotMessage({
        text: NOT_FOUND_TEXT,
        quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }]
      });
    }
  }

  // =========================================================
  //  詢價流程（獨立狀態機，與 Knowledge Engine 完全分離）
  // ---------------------------------------------------------
  //  Quick Reply → 詢價流程狀態機 → 完成摘要
  //  不經過 sendToAI()，也不查詢 knowledge.json。
  // =========================================================

  /**
   * 處理詢價流程中「點擊快速選項」的各個步驟。
   * @param {string} payload - 以 "quote:" 開頭的 payload
   * @returns {void}
   */
  function handleQuoteStep(payload) {
    if (payload === "quote:start") {
      state.quote = { active: true, step: "item", item: null, qty: null, contact: null };
      renderBotMessage({
        text: "好的，我來協助您進行線上詢價 📝\n請問想詢問的品項類別是？",
        quickReplies: [
          { label: "💍 婚禮喜餅", payload: "quote:item:婚禮喜餅" },
          { label: "👶 彌月禮盒", payload: "quote:item:彌月禮盒" },
          { label: "🏢 企業採購", payload: "quote:item:企業採購" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
      return;
    }

    if (payload.indexOf("quote:item:") === 0) {
      state.quote.item = payload.slice("quote:item:".length);
      state.quote.step = "qty";
      renderBotMessage({
        text: "了解，「" + state.quote.item + "」大約需要多少數量呢？（可先概估）",
        quickReplies: [
          { label: "30 盒以下", payload: "quote:qty:30盒以下" },
          { label: "30～100 盒", payload: "quote:qty:30~100盒" },
          { label: "100 盒以上", payload: "quote:qty:100盒以上" }
        ]
      });
      return;
    }

    if (payload.indexOf("quote:qty:") === 0) {
      state.quote.qty = payload.slice("quote:qty:".length);
      state.quote.step = "contact";
      renderBotMessage({
        text:
          "最後，麻煩留下您方便聯繫的方式（電話或 LINE ID／Email 皆可），" +
          "我們的專屬服務員將盡快與您確認明細與正式報價 🙏\n\n（直接在下方輸入框打字送出即可）"
      });
      return;
    }
  }

  /**
   * 使用者輸入聯絡方式後，完成詢價流程並顯示摘要。
   * @returns {void}
   */
  function finishQuoteFlow() {
    const q = state.quote;
    renderBotMessage({
      text:
        "感謝您的詢問！以下為本次諮詢摘要：\n\n・品項：" +
        (q.item || "未指定") +
        "\n・預估數量：" +
        (q.qty || "未指定") +
        "\n・聯絡方式：" +
        (q.contact || "未提供") +
        "\n\n我們的專屬服務員將於 1–2 個工作日內主動與您聯繫。若希望更快收到回覆，也歡迎直接填寫官方洽詢單或加 LINE 好友喔！",
      quickReplies: [
        { label: "📋 前往官方洽詢單", payload: "link:survey" },
        { label: "🔗 加 LINE 好友", payload: "link:line" },
        { label: "🔙 返回主選單", payload: "menu:main" }
      ]
    });
    state.quote = { active: false, step: null, item: null, qty: null, contact: null };
  }

  // ---------- 使用者互動 ----------

  /**
   * 快速回覆按鈕點擊的統一路由。
   * 依 payload 前綴分派到：選單導覽 / 外部連結 / 詢價流程 / Knowledge Engine 查詢。
   * @param {string} label - 按鈕顯示文字
   * @param {string} payload - 按鈕對應的 payload
   * @returns {void}
   */
  function onQuickReply(label, payload) {
    renderUserMessage(label);

    // 選單導覽（純 UI 導覽，不查詢知識庫）
    if (payload === "menu:main") {
      renderMenu();
      return;
    }
    if (payload === "menu:faq") {
      renderFaqMenu();
      return;
    }

    // 外部連結（開新分頁，非知識內容）
    if (payload === "link:survey") {
      window.open(LINKS.survey, "_blank", "noopener");
      renderBotMessage({ text: "已為您開啟官方洽詢單頁面，若視窗未自動開啟，也可點擊下方按鈕重新開啟。" });
      return;
    }
    if (payload === "link:line") {
      window.open(LINKS.line, "_blank", "noopener");
      renderBotMessage({ text: "已為您開啟官方 LINE 頁面，若視窗未自動開啟，也可點擊下方按鈕重新開啟。" });
      return;
    }

    // 詢價流程（獨立狀態機，不經過 Knowledge Engine）
    if (payload.indexOf("quote:") === 0) {
      handleQuoteStep(payload);
      return;
    }

    // 知識查詢（唯一會呼叫 sendToAI() 的 quick reply 類型）
    if (payload.indexOf("kb:") === 0) {
      const query = payload.slice("kb:".length);
      simulateThinking(function () {
        sendToAI(query)
          .then(renderBotMessage)
          .catch(function (err) {
            console.warn("[AIConcierge] 訊息處理發生未預期錯誤：", err);
            renderBotMessage({ text: NOT_FOUND_TEXT, quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }] });
          });
      });
      return;
    }

    // 未知 payload：安全回退到主選單
    renderMenu();
  }

  /**
   * 使用者於輸入框打字送出訊息。
   * 若目前正處於詢價流程的「聯絡方式」步驟，優先當作聯絡資訊處理；
   * 否則一律送進 sendToAI()（Knowledge Engine）搜尋。
   * @returns {void}
   */
  function handleUserSubmit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    renderUserMessage(text);

    // 詢價流程進行中，且正在等待聯絡方式
    if (state.quote.active && state.quote.step === "contact") {
      state.quote.contact = text;
      finishQuoteFlow();
      return;
    }

    simulateThinking(function () {
      sendToAI(text)
        .then(renderBotMessage)
        .catch(function (err) {
          console.warn("[AIConcierge] 訊息處理發生未預期錯誤：", err);
          renderBotMessage({ text: NOT_FOUND_TEXT, quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }] });
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
  //  sendToAI()  —— 唯一知識來源：Knowledge Engine
  // ---------------------------------------------------------
  //  輸入：使用者查詢文字（string）
  //  輸出：Promise<{ text, quickReplies, cards, moreUrl }>
  //
  //  流程：使用者輸入 → Knowledge Engine → 回答
  //  沒有 Mock fallback，也不會呼叫 aiService／OpenAI。
  //  找不到資料時，回傳固定訊息，並附上「返回主選單」按鈕。
  // =========================================================
  async function sendToAI(query) {
    // 全域關閉開關：停用時直接回覆固定訊息，不查詢 knowledge.json
    if (window.USE_KNOWLEDGE_ENGINE === false) {
      return {
        text: NOT_FOUND_TEXT,
        quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }],
        cards: [],
        moreUrl: null
      };
    }

    try {
      if (!window.knowledgeEngine || typeof window.knowledgeEngine.answer !== "function") {
        throw new Error("window.knowledgeEngine 尚未就緒，請確認 knowledge-engine.js 已於 ai-chat.js 之前載入");
      }
      const result = await window.knowledgeEngine.answer(query);
      return adaptKnowledgeResponse(result);
    } catch (err) {
      console.warn("[AIConcierge] Knowledge Engine 查詢發生錯誤，改用固定回覆：", err);
      return {
        text: NOT_FOUND_TEXT,
        quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }],
        cards: [],
        moreUrl: null
      };
    }
  }

  /**
   * 將 window.knowledgeEngine.answer() 的回傳格式
   * { found, title, content, url }
   * 轉換成 renderBotMessage() 所需的 { text, quickReplies, cards, moreUrl } 結構。
   * 一律附上「返回主選單」按鈕，方便使用者繼續瀏覽。
   * @param {{found:boolean, content:string, url:(string|null)}} result - Knowledge Engine 回傳結果
   * @returns {{text:string, quickReplies:Array, cards:Array, moreUrl:(string|null)}}
   */
  function adaptKnowledgeResponse(result) {
    return {
      text: result.content,
      quickReplies: [{ label: "🔙 返回主選單", payload: "menu:main" }],
      cards: [],
      moreUrl: result.found && result.url ? result.url : null
    };
  }

  // ---------- 初始化 ----------
  function init() {
    if (!window.knowledgeEngine) {
      console.warn("[AIConcierge] 找不到 window.knowledgeEngine，請確認 knowledge-engine.js 已於本檔案之前載入");
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
