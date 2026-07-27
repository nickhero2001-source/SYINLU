/* =========================================================
   幸福+工場 · AI 採購顧問 —— Mock 資料 / 對話引擎
   -----------------------------------------------------------
   本檔案為「假資料版」大腦：
   1) 用一組對話樹（flows）模擬：禮盒推薦／企業採購／ESG介紹／FAQ／詢價流程
   2) 提供關鍵字比對，讓使用者的自由輸入也能被導向合適流程
   3) 對外只暴露 window.MockAI.respond(text, state)，
      未來要換成真的 OpenAI／Claude API，只需要在 ai-chat.js 的
      sendToAI() 內把呼叫對象換掉，不需要更動這支檔案的介面。
   ========================================================= */

(function (global) {
  "use strict";

  // ---------- 基礎知識庫（之後可直接置換為真實商品/方案資料） ----------
  const KB = {
    greeting:
      "您好，我是幸福+工場的 AI 採購顧問 ✨\n很高興為您服務！請問今天想了解：",

    giftBoxes: [
      {
        title: "🍰 心意手工蛋捲禮盒",
        desc: "無添加防腐劑，職人手工烘焙，口感酥脆不甜膩，喜餅／彌月皆適合。",
        price: "每盒 NT$380 起，滿 30 盒享 85 折"
      },
      {
        title: "🎀 幸福雙享喜餅禮盒",
        desc: "中西式糕點雙拼，色彩討喜，適合婚宴回禮與長輩送禮。",
        price: "每盒 NT$450 起，滿 50 盒享 85 折"
      },
      {
        title: "👶 彌月福袋禮盒",
        desc: "小巧包裝、款式多元，可混搭挑選，附精美彌月卡。",
        price: "每盒 NT$320 起，滿 30 盒享 9 折"
      },
      {
        title: "🏢 企業伴手禮禮盒",
        desc: "大宗採購可客製化外盒與提袋印刷，附統一發票與送貨簽收單。",
        price: "依數量與客製化程度報價，200 盒以上另有專案優惠"
      }
    ],

    esg: {
      title: "🌱 ESG 與社會影響力",
      points: [
        "幸福+工場由財團法人心路社會福利基金會成立，協助心智障礙青年獲得穩定就業機會。",
        "每一份訂單都直接支持庇護工場的職人薪資與職能培訓，形成「消費即公益」的正向循環。",
        "產品堅持無防腐劑、少油少糖的手工製程，兼顧健康與友善環境的包裝選擇。",
        "企業採購本產品可作為 ESG／CSR 報告中「社會共融採購」的具體實績。"
      ]
    },

    faq: [
      {
        q: "訂購流程是什麼？",
        a: "您可以透過線上洽詢單、LINE 官方帳號或電話與專屬服務員聯繫，我們會協助確認款式、數量與交期，並提供正式報價單。"
      },
      {
        q: "出貨與到貨時間？",
        a: "一般訂單約需 7–10 個工作日製作，喜慶旺季（如年節、畢業季）建議提前 3–4 週預訂，以確保交期。"
      },
      {
        q: "付款方式與發票？",
        a: "支援匯款、轉帳與企業請款，皆可開立統一發票；企業採購也可申請月結。"
      },
      {
        q: "可以客製化嗎？",
        a: "可依需求客製化外盒設計、提袋印刷、卡片文字與數量組合，企業大宗採購另有專屬提案服務。"
      },
      {
        q: "服務時間？",
        a: "週一至週五 9:30～17:30，非上班時間的訊息我們會於下一個工作日儘快回覆您。"
      }
    ]
  };

  // ---------- 工具：組出一則「機器人訊息」物件 ----------
  function bot(text, opts) {
    return Object.assign({ from: "bot", text: text, quickReplies: [], cards: [] }, opts || {});
  }

  // ---------- 對話樹：以 payload 對應到下一步 ----------
  const FLOWS = {
    "menu:main": function () {
      return bot(KB.greeting, {
        quickReplies: [
          { label: "🎁 禮盒推薦", payload: "flow:gift" },
          { label: "🏢 企業採購", payload: "flow:corporate" },
          { label: "🌱 ESG 說明", payload: "flow:esg" },
          { label: "❓ 常見問題", payload: "flow:faq" },
          { label: "💬 線上詢價", payload: "flow:quote:start" }
        ]
      });
    },

    // ------- 1. 禮盒推薦 -------
    "flow:gift": function () {
      return bot("好的！請問您想尋找的是哪一種場合的禮盒呢？", {
        quickReplies: [
          { label: "💍 婚禮喜餅", payload: "gift:wedding" },
          { label: "👶 彌月禮盒", payload: "gift:baby" },
          { label: "🏢 企業伴手禮", payload: "gift:corporate" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },
    "gift:wedding": function () {
      const item = KB.giftBoxes[1];
      return bot("為您推薦這款婚禮喜餅人氣禮盒：", {
        cards: [item],
        quickReplies: [
          { label: "📩 加入詢價", payload: "flow:quote:start" },
          { label: "看其他款式", payload: "flow:gift" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },
    "gift:baby": function () {
      const item = KB.giftBoxes[2];
      return bot("彌月禮盒中最受歡迎的是這一款：", {
        cards: [item],
        quickReplies: [
          { label: "📩 加入詢價", payload: "flow:quote:start" },
          { label: "看其他款式", payload: "flow:gift" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },
    "gift:corporate": function () {
      const item = KB.giftBoxes[3];
      return bot("企業伴手禮的話，這個方案最多客戶採用：", {
        cards: [item],
        quickReplies: [
          { label: "了解企業採購方案", payload: "flow:corporate" },
          { label: "📩 加入詢價", payload: "flow:quote:start" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },

    // ------- 2. 企業採購 -------
    "flow:corporate": function () {
      return bot(
        "企業採購方案說明：\n\n・可依預算與人數彈性搭配款式\n・200 盒以上可申請客製化外盒／提袋印刷\n・提供正式報價單、合約與統一發票\n・支援月結付款，方便財務作業\n・每筆訂單皆支持心路基金會青年就業，可納入 ESG／CSR 採購紀錄",
        {
          quickReplies: [
            { label: "🌱 了解 ESG 效益", payload: "flow:esg" },
            { label: "📩 我要詢價", payload: "flow:quote:start" },
            { label: "🔙 返回主選單", payload: "menu:main" }
          ]
        }
      );
    },

    // ------- 3. ESG 介紹 -------
    "flow:esg": function () {
      const body = KB.esg.points.map((p) => "・" + p).join("\n\n");
      return bot(KB.esg.title + "\n\n" + body, {
        quickReplies: [
          { label: "了解企業採購", payload: "flow:corporate" },
          { label: "📩 我要詢價", payload: "flow:quote:start" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },

    // ------- 4. FAQ -------
    "flow:faq": function () {
      return bot("常見問題，請點選您想了解的項目：", {
        quickReplies: KB.faq
          .map((item, idx) => ({ label: item.q, payload: "faq:" + idx }))
          .concat([{ label: "🔙 返回主選單", payload: "menu:main" }])
      });
    },

    // ------- 5. 詢價流程（多輪） -------
    "flow:quote:start": function () {
      return bot("好的，我來協助您進行線上詢價 📝\n請問想詢問的品項類別是？", {
        quickReplies: [
          { label: "💍 婚禮喜餅", payload: "quote:item:婚禮喜餅" },
          { label: "👶 彌月禮盒", payload: "quote:item:彌月禮盒" },
          { label: "🏢 企業採購", payload: "quote:item:企業採購" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    },
    "flow:quote:qty": function (state) {
      return bot("了解，「" + state.quoteItem + "」大約需要多少數量呢？（可先概估）", {
        quickReplies: [
          { label: "30 盒以下", payload: "quote:qty:30盒以下" },
          { label: "30～100 盒", payload: "quote:qty:30~100盒" },
          { label: "100 盒以上", payload: "quote:qty:100盒以上" }
        ]
      });
    },
    "flow:quote:contact": function () {
      return bot(
        "最後，麻煩留下您方便聯繫的方式（電話或 LINE ID／Email 皆可），我們的專屬服務員將盡快與您確認明細與正式報價 🙏\n\n（直接在下方輸入框打字送出即可）"
      );
    },
    "flow:quote:done": function (state) {
      return bot(
        "感謝您的詢問！以下為本次諮詢摘要：\n\n・品項：" +
          (state.quoteItem || "未指定") +
          "\n・預估數量：" +
          (state.quoteQty || "未指定") +
          "\n・聯絡方式：" +
          (state.quoteContact || "未提供") +
          "\n\n我們的專屬服務員將於 1–2 個工作日內主動與您聯繫。若希望更快收到回覆，也歡迎直接填寫官方洽詢單或加 LINE 好友喔！",
        {
          quickReplies: [
            { label: "📋 前往官方洽詢單", payload: "link:survey" },
            { label: "🔗 加 LINE 好友", payload: "link:line" },
            { label: "🔙 返回主選單", payload: "menu:main" }
          ]
        }
      );
    }
  };

  // FAQ 動態項目
  KB.faq.forEach(function (item, idx) {
    FLOWS["faq:" + idx] = function () {
      return bot(item.a, {
        quickReplies: [
          { label: "看其他問題", payload: "flow:faq" },
          { label: "📩 我要詢價", payload: "flow:quote:start" },
          { label: "🔙 返回主選單", payload: "menu:main" }
        ]
      });
    };
  });

  // 外部連結（模擬導轉，先用假訊息呈現，實際上可直接開新分頁）
  FLOWS["link:survey"] = function () {
    return bot("已為您開啟官方洽詢單頁面，若視窗未自動開啟，也可點擊下方連結：\nhttps://www.surveycake.com/s/xOYP9");
  };
  FLOWS["link:line"] = function () {
    return bot("歡迎加入幸福+工場官方 LINE，取得最新優惠與即時客服：\nhttps://line.me/R/ti/p/@570brfxc/");
  };

  // ---------- 關鍵字比對（處理使用者「自由輸入」的文字） ----------
  const KEYWORD_MAP = [
    { keys: ["禮盒", "推薦", "喜餅", "款式", "彌月"], payload: "flow:gift" },
    { keys: ["企業", "採購", "公司", "大量", "批發"], payload: "flow:corporate" },
    { keys: ["esg", "公益", "基金會", "心路", "永續"], payload: "flow:esg" },
    { keys: ["問題", "faq", "常見", "怎麼訂", "發票", "付款", "出貨"], payload: "flow:faq" },
    { keys: ["詢價", "報價", "多少錢", "價格", "訂購"], payload: "flow:quote:start" }
  ];

  function matchKeyword(text) {
    const lower = text.toLowerCase();
    for (const rule of KEYWORD_MAP) {
      if (rule.keys.some((k) => lower.indexOf(k.toLowerCase()) !== -1)) {
        return rule.payload;
      }
    }
    return null;
  }

  // ---------- 對外主入口 ----------
  // state 由呼叫端（ai-chat.js）維護，包含詢價流程暫存的 quoteItem / quoteQty / quoteContact 等
  function respond(input, state) {
    state = state || {};

    // 1) 使用者點擊 quick reply，payload 即為 flow key
    if (input && input.type === "payload") {
      const payload = input.value;

      // 詢價流程的特殊 payload：quote:item:xxx / quote:qty:xxx
      if (payload.indexOf("quote:item:") === 0) {
        state.quoteItem = payload.replace("quote:item:", "");
        return FLOWS["flow:quote:qty"](state);
      }
      if (payload.indexOf("quote:qty:") === 0) {
        state.quoteQty = payload.replace("quote:qty:", "");
        state.awaitingContact = true;
        return FLOWS["flow:quote:contact"](state);
      }
      if (FLOWS[payload]) {
        return FLOWS[payload](state);
      }
      return FLOWS["menu:main"](state);
    }

    // 2) 使用者自由輸入文字
    const text = (input && input.value ? input.value : "").trim();

    // 若正在詢價流程中等待「聯絡方式」，優先視為聯絡資訊
    if (state.awaitingContact) {
      state.quoteContact = text;
      state.awaitingContact = false;
      return FLOWS["flow:quote:done"](state);
    }

    const matched = matchKeyword(text);
    if (matched) {
      if (matched === "flow:quote:start") {
        return FLOWS[matched](state);
      }
      return FLOWS[matched](state);
    }

    // 3) 都比對不到 → 友善預設回覆 + 選單
    return bot(
      "不好意思，我可能沒有完全理解您的問題 🙏\n您可以直接點選下方選項，或換個方式描述，我會盡力協助您！",
      {
        quickReplies: [
          { label: "🎁 禮盒推薦", payload: "flow:gift" },
          { label: "🏢 企業採購", payload: "flow:corporate" },
          { label: "❓ 常見問題", payload: "flow:faq" },
          { label: "💬 線上詢價", payload: "flow:quote:start" }
        ]
      }
    );
  }

  global.MockAI = {
    KB: KB,
    respond: respond,
    getGreeting: function () {
      return FLOWS["menu:main"]();
    }
  };
})(window);
