/* =========================================================
   幸福+工場 · AI 採購顧問（浮動客服元件）
   -----------------------------------------------------------
   模組化重點：
   - 不修改既有版型/商品頁/動畫，僅在 <body> 結尾附加獨立元件
   - 所有邏輯包在 IIFE 內，避免污染全域變數（僅暴露 window.AIConcierge）
   - sendToAI() 為預留串接真實 AI（OpenAI／Claude API）的唯一入口，
     目前內部呼叫 window.MockAI，之後串接時只需改寫這支函式的內容
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
    // msg: { text, quickReplies, cards }
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

    // 快速回覆按鈕
    if (msg.quickReplies && msg.quickReplies.length) {
      const qrWrap = document.createElement("div");
      qrWrap.className = "ac-quick-replies";
      msg.quickReplies.forEach(function (qr) {
        const chip = document.createElement("button");
        chip.className = "ac-chip";
        chip.textContent = qr.label;
        chip.addEventListener("click", function () {
          onQuickReply(qr.label, qr.payload);
        });
        qrWrap.appendChild(chip);
      });
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
      const reply = sendToAI({ type: "payload", value: payload });
      renderBotMessage(reply);
    });
  }

  function handleUserSubmit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    renderUserMessage(text);
    state.history.push({ from: "user", text: text });

    simulateThinking(function () {
      const reply = sendToAI({ type: "text", value: text });
      renderBotMessage(reply);
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
  //  sendToAI()  —— 預留串接真實 AI 服務的唯一入口
  // ---------------------------------------------------------
  //  現況：呼叫 window.MockAI.respond() 回傳假資料
  //  未來串接 OpenAI / Claude API 時，建議作法：
  //    1) 將此函式改為 async，並改用 fetch() 呼叫後端代理
  //       （切勿在前端直接放 API Key，需透過自架後端或 Cloudflare
  //         Worker 轉發請求，並記得同步更新 _headers 的
  //         connect-src 白名單）
  //    2) 保持傳入/傳出的資料結構一致：
  //       輸入 { type: 'text'|'payload', value: string }
  //       輸出 { text: string, quickReplies?: [...], cards?: [...] }
  //       如此一來 ai-chat.js 的渲染邏輯完全不需要更動
  // =========================================================
  function sendToAI(input) {
    // TODO: 之後串接真實 AI 服務時，將下面這行替換為 API 呼叫
    return window.MockAI.respond(input, state);
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
