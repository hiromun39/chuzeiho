/* =========================================
   Square Web Payments SDK ラッパー（本番カード入力）
   - Application ID / Location ID は公開情報（フロント埋め込みOK）
   - カード情報は Square の安全なフォーム内で扱われ、自サイトには一切残らない
   - 役割: モーダルでカード入力 → tokenize() → nonce(ワンタイムトークン) を返す
   ========================================= */

(function () {
  "use strict";

  // ★ 本番（Production）の Application ID / Location ID（公開情報）
  const SQUARE_APPLICATION_ID = "sq0idp-8TCRyzZSr9GQIV-M4a2OHg";
  const SQUARE_LOCATION_ID = "L8K5SHHMMD3A5";

  let payments = null;
  let card = null;
  let isInitialized = false;
  let isInitializing = false;

  let pendingResolve = null;
  let pendingReject = null;

  // ---------- カードフォームの初期化（初回のみ） ----------
  async function initCardForm() {
    if (isInitialized) return;
    if (isInitializing) {
      while (isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }
    if (!window.Square) {
      throw new Error("Square の決済SDKが読み込まれていません。ページを再読み込みしてください。");
    }

    isInitializing = true;
    try {
      payments = window.Square.payments(SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID);
      card = await payments.card();
      await card.attach("#square-card-container");
      isInitialized = true;
    } finally {
      isInitializing = false;
    }
  }

  function showModal() {
    const overlay = document.getElementById("square-card-modal");
    if (overlay) overlay.style.display = "flex";
  }

  function hideModal() {
    const overlay = document.getElementById("square-card-modal");
    if (overlay) overlay.style.display = "none";
  }

  function showError(msg) {
    const el = document.getElementById("square-card-error");
    if (el) {
      el.textContent = msg || "";
      el.style.display = msg ? "block" : "none";
    }
  }

  function setLoading(loading) {
    const btn = document.getElementById("square-card-submit");
    if (btn) {
      btn.disabled = !!loading;
      btn.textContent = loading ? "処理中…" : "このカードで登録する";
    }
  }

  // ---------- カード入力モーダルを開き、tokenize した nonce を返す ----------
  function requestCardNonce() {
    return new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
      showError("");
      showModal();

      initCardForm().catch((err) => {
        showError(err.message);
        reject(err);
        pendingResolve = null;
        pendingReject = null;
      });
    });
  }

  function cancel() {
    hideModal();
    showError("");
    if (pendingReject) pendingReject(new Error("カード入力がキャンセルされました。"));
    pendingResolve = null;
    pendingReject = null;
  }

  async function submit() {
    if (!card) {
      showError("カードフォームが準備できていません。少し待ってから再度お試しください。");
      return;
    }
    setLoading(true);
    showError("");
    try {
      const result = await card.tokenize();
      if (result.status === "OK") {
        const token = result.token;
        hideModal();
        if (pendingResolve) pendingResolve(token);
        pendingResolve = null;
        pendingReject = null;
      } else {
        const msg = (result.errors && result.errors.map((e) => e.message).join(" / ")) || "カード情報を確認してください。";
        showError(msg);
      }
    } catch (e) {
      showError(e.message || "カード処理に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    const submitBtn = document.getElementById("square-card-submit");
    const cancelBtn = document.getElementById("square-card-cancel");
    if (submitBtn) submitBtn.addEventListener("click", submit);
    if (cancelBtn) cancelBtn.addEventListener("click", cancel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEvents);
  } else {
    bindEvents();
  }

  window.AppSquare = {
    requestCardNonce,
    cancel,
  };
})();