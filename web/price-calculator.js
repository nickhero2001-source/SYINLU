/* =========================================================
   幸福+工場 · 禮盒金額試算區塊
   -----------------------------------------------------------
   獨立模組，不依賴 AI 聊天元件，也不影響既有版型。
   資料來源：/pricing.json（單一事實來源，價格如需更新
   只需修改該檔案，不需要動這支程式）。

   運作方式：
   1) 掛載到 <div id="price-calculator-root"></div>
   2) fetch('/pricing.json') 載入商品單價與折扣區間
   3) 使用者選擇禮盒款式＋數量（可選加購中式漢餅）
   4) 即時計算：小計 → 依數量區間套用折扣 → 預估總額
      （Yumthé 花獻禮盒為「階梯定價」，非乘以折扣，邏輯分開處理）
   5) 顯示是否達免運門檻
   ========================================================= */

(function () {
  "use strict";

  const MOUNT_ID = "price-calculator-root";
  const PRICING_URL = "/pricing.json";

  let pricing = null;
  let root = null;

  // ---------- 折扣計算 ----------

  /**
   * 依數量在一組區間表中找出對應的折扣倍率（一般禮盒用：單價 × 折扣率）。
   * 數量低於最低區間下限時，視為無折扣（rate = 1）。
   * @param {Array<{min:number, max:(number|null), rate:number}>} tiers
   * @param {number} qty
   * @returns {number} 折扣倍率（例如 0.95），找不到符合區間則回傳 1
   */
  function findRate(tiers, qty) {
    for (const tier of tiers) {
      const withinMin = qty >= tier.min;
      const withinMax = tier.max === null || qty <= tier.max;
      if (withinMin && withinMax) return tier.rate;
    }
    // 超過表列最大值時，套用最後一個（通常是「以上」）區間
    const last = tiers[tiers.length - 1];
    if (last && qty > (last.max === null ? last.min : last.max)) return last.rate;
    return 1;
  }

  /**
   * 依數量在 Yumthé 花獻禮盒的「階梯定價表」中找出對應的單價（非乘以折扣率，是直接查表單價）。
   * @param {Array<{min:number, max:(number|null), price:number}>} tiers
   * @param {number} qty
   * @returns {number} 該數量區間對應的單價
   */
  function findStepPrice(tiers, qty) {
    for (const tier of tiers) {
      const withinMin = qty >= tier.min;
      const withinMax = tier.max === null || qty <= tier.max;
      if (withinMin && withinMax) return tier.price;
    }
    if (qty < tiers[0].min) return tiers[0].price;
    return tiers[tiers.length - 1].price;
  }

  function formatMoney(n) {
    return "NT$" + Math.round(n).toLocaleString("zh-Hant-TW");
  }

  // ---------- DOM 建立 ----------

  function buildDOM() {
    root = document.getElementById(MOUNT_ID);
    if (!root) return;

    root.innerHTML =
      '<div class="pc-card">' +
      '  <div class="pc-row">' +
      '    <div class="pc-field">' +
      '      <label class="pc-label" for="pcProduct">選擇禮盒款式</label>' +
      '      <select class="pc-select" id="pcProduct"></select>' +
      "    </div>" +
      '    <div class="pc-field">' +
      '      <label class="pc-label" for="pcQty">訂購數量（盒）</label>' +
      '      <input class="pc-input" id="pcQty" type="number" min="1" step="1" value="30" />' +
      "    </div>" +
      "  </div>" +
      '  <div class="pc-addon">' +
      '    <input type="checkbox" id="pcAddonCheck" />' +
      '    <div style="flex:1">' +
      '      <label class="pc-addon-text" for="pcAddonCheck" id="pcAddonLabel"></label>' +
      '      <div class="pc-field pc-addon-qty" id="pcAddonQtyWrap">' +
      '        <label class="pc-label" for="pcAddonQty">加購數量（份，最低加購量依規定）</label>' +
      '        <input class="pc-input" id="pcAddonQty" type="number" min="1" step="1" value="12" />' +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      '  <div class="pc-result" id="pcResult"></div>' +
      '  <div class="pc-cta">' +
      '    <a class="pc-cta-btn" href="https://www.surveycake.com/s/xOYP9" target="_blank" rel="noopener">📋 前往正式洽詢單</a>' +
      '    <a class="pc-cta-btn" href="https://line.me/R/ti/p/@570brfxc/" target="_blank" rel="noopener">🔗 加 LINE 詢問專員</a>' +
      "  </div>" +
      '  <p class="pc-disclaimer">試算結果僅供參考，不含謝卡、口味加價換購等客製化費用；正式報價請洽專屬服務員確認。</p>' +
      "</div>";

    populateProductSelect();
    populateAddonLabel();
    bindEvents();
    recalc();
  }

  function populateProductSelect() {
    const select = document.getElementById("pcProduct");
    const bySeries = {};
    pricing.products.forEach(function (p) {
      if (!bySeries[p.series]) bySeries[p.series] = [];
      bySeries[p.series].push(p);
    });

    Object.keys(bySeries).forEach(function (series) {
      const group = document.createElement("optgroup");
      group.label = series;
      bySeries[series].forEach(function (p) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.variant + "（NT$" + p.unitPrice + " 起 / 盒）";
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
  }

  function populateAddonLabel() {
    const label = document.getElementById("pcAddonLabel");
    const addon = pricing.addon;
    label.textContent =
      addon.label + "，每份 NT$" + addon.unitPrice + "，最低加購 " + addon.minQty + " 份。" + addon.note;
  }

  function bindEvents() {
    document.getElementById("pcProduct").addEventListener("change", recalc);
    document.getElementById("pcQty").addEventListener("input", recalc);
    document.getElementById("pcAddonQty").addEventListener("input", recalc);
    document.getElementById("pcAddonCheck").addEventListener("change", function () {
      const wrap = document.getElementById("pcAddonQtyWrap");
      wrap.classList.toggle("show", this.checked);
      recalc();
    });
  }

  // ---------- 核心試算邏輯 ----------

  function recalc() {
    const productId = document.getElementById("pcProduct").value;
    const product = pricing.products.find(function (p) {
      return p.id === productId;
    });
    if (!product) return;

    const qtyRaw = parseInt(document.getElementById("pcQty").value, 10);
    const qty = qtyRaw > 0 ? qtyRaw : 0;

    let unitPrice, appliedRateLabel, giftSubtotal;

    if (product.pricing && pricing.yumtheTiers[product.pricing]) {
      // Yumthé 花獻禮盒：階梯定價（查表單價 × 數量），非一般折扣率
      unitPrice = qty > 0 ? findStepPrice(pricing.yumtheTiers[product.pricing], qty) : product.unitPrice;
      giftSubtotal = unitPrice * qty;
      appliedRateLabel = "依數量階梯定價（單價 " + formatMoney(unitPrice) + "／盒）";
    } else {
      const group = pricing.discountGroups[product.discountGroup];
      const rate = qty > 0 ? findRate(group.tiers, qty) : 1;
      unitPrice = product.unitPrice;
      giftSubtotal = unitPrice * qty * rate;
      appliedRateLabel = rate < 1 ? Math.round(rate * 100) + "折" : "未達折扣門檻（原價）";
    }

    // 加購：中式漢餅
    const addonChecked = document.getElementById("pcAddonCheck").checked;
    let addonSubtotal = 0;
    let addonNote = "";
    if (addonChecked) {
      const addonQtyRaw = parseInt(document.getElementById("pcAddonQty").value, 10);
      const addonQty = addonQtyRaw > 0 ? addonQtyRaw : 0;
      const addon = pricing.addon;

      let addonRate = 1;
      if (product.pricing) {
        // 搭配 Yumthé 花獻禮盒：使用專屬的漢餅折扣區間
        addonRate = addonQty > 0 ? findRate(pricing.addonYumtheTiers, addonQty) : 1;
      } else {
        addonRate = addonQty > 0 ? findRate(pricing.discountGroups[product.discountGroup].tiers, addonQty) : 1;
      }

      addonSubtotal = addon.unitPrice * addonQty * addonRate;

      if (addonQty > 0 && addonQty < addon.minQty) {
        addonNote =
          '<div class="pc-result-row" style="color:#c96878">⚠ 漢餅加購最低數量為 ' + addon.minQty + " 份，請調整數量</div>";
      }
    }

    const total = giftSubtotal + addonSubtotal;
    const isFreeShipping = total >= pricing.freeShippingThreshold;

    renderResult({
      product: product,
      qty: qty,
      unitPrice: unitPrice,
      appliedRateLabel: appliedRateLabel,
      giftSubtotal: giftSubtotal,
      addonChecked: addonChecked,
      addonSubtotal: addonSubtotal,
      addonNote: addonNote,
      total: total,
      isFreeShipping: isFreeShipping
    });
  }

  function renderResult(r) {
    const el = document.getElementById("pcResult");
    let html = "";

    html += '<div class="pc-result-row"><span>禮盒單價</span><span class="pc-val">' + formatMoney(r.unitPrice) + " / 盒</span></div>";
    html += '<div class="pc-result-row"><span>訂購數量</span><span class="pc-val">' + r.qty + " 盒</span></div>";
    html +=
      '<div class="pc-result-row pc-discount"><span>適用折扣</span><span class="pc-val">' + r.appliedRateLabel + "</span></div>";
    html += '<div class="pc-result-row"><span>禮盒小計</span><span class="pc-val">' + formatMoney(r.giftSubtotal) + "</span></div>";

    if (r.addonChecked) {
      html += '<div class="pc-result-row"><span>中式漢餅加購小計</span><span class="pc-val">' + formatMoney(r.addonSubtotal) + "</span></div>";
      html += r.addonNote;
    }

    html +=
      '<div class="pc-total-row"><span class="pc-total-label">預估總額</span><span class="pc-total-value">' +
      formatMoney(r.total) +
      "</span></div>";

    const shippingClass = r.isFreeShipping ? "" : " pc-not-free";
    const shippingText = r.isFreeShipping
      ? "✓ 已達 NT$" + pricing.freeShippingThreshold.toLocaleString("zh-Hant-TW") + " 免運門檻（單一地址）"
      : "尚差 " +
        formatMoney(pricing.freeShippingThreshold - r.total) +
        " 即可享單一地址免運（門檻 NT$" +
        pricing.freeShippingThreshold.toLocaleString("zh-Hant-TW") +
        "）";
    html += '<div class="pc-shipping-note' + shippingClass + '">' + shippingText + "</div>";

    el.innerHTML = html;
  }

  // ---------- 初始化 ----------

  async function init() {
    root = document.getElementById(MOUNT_ID);
    if (!root) return; // 頁面上沒有掛載點就不執行，不影響其他頁面

    root.innerHTML = '<div class="pc-loading">試算工具載入中…</div>';

    try {
      const res = await fetch(PRICING_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      pricing = await res.json();
      buildDOM();
    } catch (err) {
      console.warn("[PriceCalculator] 載入 pricing.json 失敗：", err);
      root.innerHTML =
        '<div class="pc-error">試算工具暫時無法載入，請稍後再試，或直接聯繫專屬服務員為您試算。</div>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
