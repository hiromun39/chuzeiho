/* =========================================
   メインUI制御
   ・コイン投げアニメーション
   ・6回の投げの順次処理
   ・結果（本卦・之卦・賓卦・裏卦・互卦）表示
   ・朱子ルールによる爻辞表示
   ========================================= */

(function () {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const coin1 = $("coin1");
  const coin2 = $("coin2");
  const coin3 = $("coin3");
  const yaoResult = $("yao-result");
  const btnToss = $("btn-toss");
  const btnSkip = $("btn-skip");
  const btnReset = $("btn-reset");
  const yaoSlots = [...document.querySelectorAll(".yao-slot")];
  const resultArea = $("result-area");
  const resultEl = $("result");
  const yaojiArea = $("yaoji-area");
  const yaojiEl = $("yaoji");
  const aiArea = $("ai-area");
  const aiOutput = $("ai-output");
  const btnAi = $("btn-ai");
  const fortuneText = $("fortune-text");
  const inputCount = $("input-count");

  // 一般モード用DOM
  const resultAreaSimple = $("result-area-simple");
  const resultSimpleEl = $("result-simple");
  const yaojiAreaSimple = $("yaoji-area-simple");
  const yaojiSimpleEl = $("yaoji-simple");
  const progressEl = $("progress");
  const ceremonyNote = $("ceremony-note");
  const btnModeToggle = $("btn-mode-toggle");
  const modeSwitchLabel = $("mode-switch-label");
  const introSimpleHead = $("intro-simple-head");
  const introSimpleBody = $("intro-simple-body");
  const introFoldIcon = $("intro-fold-icon");
  const introSimple = $("intro-simple");
  const introAcademic = $("intro-academic");
  const testArea = $("test-area");

  // ---------- 状態 ----------
  let values = [];      // 得られた爻値（初爻→上爻）
  let tossCount = 0;    // 投げた回数
  let isBusy = false;   // 忙しいフラグ
  let lastResult = null; // 最後の占い結果（履歴保存用）

  // ---------- モード管理 ----------
  const MODE_KEY = "eki-sen-ui-mode";
  const CEREMONY_KEY = "eki-sen-ceremony-done";
  let uiMode = "simple";   // "simple" | "academic"

  function getUIMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "academic" || saved === "simple") return saved;
    } catch (e) {}
    return "simple";
  }

  function setUIMode(mode) {
    uiMode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    applyUIMode();
  }

  function isCeremonyDone() {
    try { return localStorage.getItem(CEREMONY_KEY) === "1"; } catch (e) { return false; }
  }

  function markCeremonyDone() {
    try { localStorage.setItem(CEREMONY_KEY, "1"); } catch (e) {}
  }

  // 表示モードをUIに反映
  function applyUIMode() {
    const academic = uiMode === "academic";

    // 説明
    if (introSimple) introSimple.style.display = academic ? "none" : "block";
    if (introAcademic) introAcademic.style.display = academic ? "block" : "none";

    // 結果・爻辞
    if (resultAreaSimple) resultAreaSimple.style.display = !academic && resultAreaSimple.querySelector(".simple-result") ? "block" : "none";
    if (resultArea) resultArea.style.display = academic && resultEl.innerHTML ? "block" : "none";
    if (yaojiAreaSimple) yaojiAreaSimple.style.display = !academic && yaojiSimpleEl.innerHTML ? "block" : "none";
    if (yaojiArea) yaojiArea.style.display = academic && yaojiEl.innerHTML ? "block" : "none";

    // モード切替ラベル
    if (modeSwitchLabel) {
      modeSwitchLabel.textContent = academic
        ? "学術モード（易の専門家向け）で表示中"
        : "一般の方向けの表示にしています";
    }
    if (btnModeToggle) {
      btnModeToggle.classList.toggle("academic", academic);
      btnModeToggle.textContent = academic ? "かんたんモードに切り替える" : "学術モードに切り替える";
    }

    // 儀式ノート（初回のみ表示）
    if (ceremonyNote) {
      ceremonyNote.style.display = (!academic && !isCeremonyDone()) ? "block" : "none";
    }

    // コインの初期表示（一般モードでは進捗を隠す）
    if (progressEl) {
      progressEl.style.display = (!academic && values.length === 0) ? "none" : "block";
    }

    // 履歴を再描画
    showHistory();
  }

  // ---------- 占的テキスト ----------
  const MAX_TEXT = 200;

  function getFortuneText() {
    if (!fortuneText) return "";
    return fortuneText.value.trim().slice(0, MAX_TEXT);
  }

  function updateCount() {
    if (!fortuneText || !inputCount) return;
    const len = fortuneText.value.length;
    inputCount.textContent = len;
    const counterParent = inputCount.closest(".input-counter");
    if (counterParent) counterParent.classList.toggle("near-limit", len >= 180);
  }

  // ---------- 履歴保存（Supabase + localStorage 併用） ----------
  function saveHistory(record) {
    // 常に localStorage に保存（バックアップ）
    try {
      const key = "eki-sen-history";
      let history = [];
      try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
      history.push(record);
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) { /* localStorage が使えない環境向けに無視 */ }

    // ログイン中は Supabase にも保存
    if (window.AppSupabase && window.AppSupabase.user) {
      window.AppSupabase.saveHistory(record);
    }
  }

  // ---------- 履歴を取得（常にlocalStorage：ログイン時はDBから同期済み） ----------
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem("eki-sen-history") || "[]");
    } catch (e) {
      return [];
    }
  }

  // ---------- 履歴更新（AI解釈などを後から追記） ----------
  function updateHistory(ts, patch) {
    try {
      const history = getHistory();
      const idx = history.findIndex(h => h.ts === ts);
      if (idx >= 0) {
        history[idx] = Object.assign({}, history[idx], patch);
      } else {
        history.push(Object.assign({ ts: ts }, patch));
      }
      localStorage.setItem("eki-sen-history", JSON.stringify(history));
    } catch (e) { /* ignore */ }

    // ログイン中は Supabase にも反映
    if (window.AppSupabase && window.AppSupabase.user) {
      window.AppSupabase.updateHistory(ts, patch);
    }
  }

  // ---------- AI解釈を履歴に保存（2000字で打ち切り） ----------
  function saveAIResult(aiText, aiMode) {
    if (!lastResult || !lastResult.ts) return;
    const trimmed = String(aiText || "").slice(0, 2000);
    updateHistory(lastResult.ts, { aiText: trimmed, aiMode: aiMode || "mock" });
  }

  // ---------- 履歴件数更新 ----------
  function updateHistoryCount() {
    const el = $("history-count");
    if (!el) return;
    const history = getHistory();
    el.textContent = `現在 ${history.length} 件`;
  }

  // ---------- 履歴表示 ----------
  function showHistory() {
    const history = getHistory();
    const container = $("history-list");
    if (!container) return;
    updateHistoryCount();

    if (history.length === 0) {
      container.innerHTML = `<p class="history-empty">まだ占い履歴がありません。占いを行うと自動的に記録されます。</p>`;
      return;
    }

    const academic = uiMode === "academic";
    const escLt = "&l" + "t;";
    const escGt = "&g" + "t;";
    const escAmp = "&a" + "mp;";

    // 新しい順に表示
    const rows = [...history].reverse().map((h, i) => {
      const d = new Date(h.ts);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const fortune = h.fortune ? `<div class="history-fortune">${h.fortune}</div>` : "";
      const aiText = h.aiText ? '<div class="history-ai"><b>AI解釈</b><br>' + h.aiText.replace(/&/g, escAmp).replace(/</g, escLt).replace(/>/g, escGt) + '</div>' : "";

      // 一般モード：シンボル・卦名の視覚表示
      if (!academic) {
        const honSym = h.honkaku ? `<span class="history-symbol">${h.honkaku.symbol || "☯"}</span>` : "";
        const honName = h.honkaku ? `<b>${h.honkaku.name}</b>` : "—";
        const shiName = h.shikaku && h.henyo && h.henyo.length > 0
          ? ` <span class="history-arrow">→</span> ${h.shikaku.name}`
          : "";
        return `
          <div class="history-item-simple">
            ${honSym}
            <div class="history-info">
              <div class="history-date-simple">${dateStr}</div>
              <div class="history-kua-simple">${honName}${shiName}</div>
              ${fortune}
            </div>
          </div>
        `;
      }

      // 学術モード：従来の詳細表示
      const hon = h.honkaku ? `<b>${h.honkaku.name}</b>（第${h.honkaku.n}卦）` : "—";
      const shi = h.shikaku ? `${h.shikaku.name}（第${h.shikaku.n}卦）` : "—";
      return `
        <div class="history-item">
          <div class="history-date">${dateStr}</div>
          <div class="history-body">
            <div class="history-kua">本卦 ${hon} ${h.henyo && h.henyo.length > 0 ? `／ 之卦 ${shi}` : ""}</div>
            ${fortune}
            ${aiText}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = rows;
  }

  // ---------- CSVエクスポート ----------
  function exportCSV() {
    const history = getHistory();
    if (history.length === 0) {
      alert("まだ占い履歴がありません。");
      return;
    }

    // BOM付きCSV（Excelで文字化けしないように）
    const header = "日時,占的,本卦,本卦番号,之卦,之卦番号,変爻,卦辞,AI解釈\n";
    const rows = history.map(h => {
      const d = new Date(h.ts);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const fortune = (h.fortune || "").replace(/"/g, '""');
      const hon = h.honkaku ? `${h.honkaku.name}` : "";
      const shi = h.shikaku ? `${h.shikaku.name}` : "";
      const henyo = h.henyo && h.henyo.length > 0 ? h.henyo.join(",") : "";
      const kaji = (h.kaji || "").replace(/"/g, '""');
      const aiText = (h.aiText || "").replace(/"/g, '""').replace(/\n/g, " ").slice(0, 2000);
      return `"${dateStr}","${fortune}","${hon}","${h.honkaku ? h.honkaku.n : ""}","${shi}","${h.shikaku ? h.shikaku.n : ""}","${henyo}","${kaji}","${aiText}"`;
    }).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `中筮法_易占履歴_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- 爻辞データ統合 ----------
  function mergeYaoji() {
    let yaoCount = 0;
    R64.kua.forEach(k => {
      // Part1〜3から爻辞を統合
      let part = null;
      if (YAOJI_PART1 && YAOJI_PART1[k.n]) part = YAOJI_PART1[k.n];
      else if (YAOJI_PART2 && YAOJI_PART2[k.n]) part = YAOJI_PART2[k.n];
      else if (YAOJI_PART3 && YAOJI_PART3[k.n]) part = YAOJI_PART3[k.n];
      if (part) {
        k.yao = part;
        yaoCount += part.length;
      }
    });
    return yaoCount;
  }

  // ---------- データ読み込み確認 ----------
  function checkData() {
    if (!R64 || !R64.kua || R64.kua.length !== 64) {
      return false;
    }
    mergeYaoji();
    return true;
  }

  // ---------- コイン表示 ----------
  function setCoins(coins) {
    const els = [coin1, coin2, coin3];
    coins.forEach((c, i) => {
      const el = els[i];
      el.textContent = c === 3 ? "表" : "裏";
      el.className = "coin " + (c === 3 ? "head" : "tail");
      // フリップアニメーション
      el.classList.add("flipping");
      setTimeout(() => el.classList.remove("flipping"), 500);
    });
  }

  // ---------- 爻結果表示 ----------
  function showYaoResult(total) {
    const info = Chusekiho.yaoInfo(total);
    let text = info.sym + " " + info.name;
    if (info.hen) text += " ◆";
    yaoResult.textContent = text;
    yaoResult.classList.add("active");
  }

  // ---------- スロット更新 ----------
  function updateSlots() {
    yaoSlots.forEach((slot, idx) => {
      if (idx < values.length) {
        const v = values[idx];
        const info = Chusekiho.yaoInfo(v);
        const isYang = v === 7 || v === 9;
        slot.innerHTML = `<div class="bar" style="background:${isYang ? "#2c2a26" : "#c8c0b0"};${info.hen ? ' class="old"' : ''}"></div><small>${info.hen ? "◆" : ""}</small>`;
        slot.classList.add("filled");
        if (info.hen) {
          slot.querySelector(".bar").classList.add("old");
          slot.querySelector(".bar").style.background = "#a82b2b";
        }
      }
    });
  }

  // ---------- 卦カード表示 ----------
  function kuaCard(label, kua, shape, note) {
    if (!kua) return "";
    const hakkaLower = Kakei.getHakka(shape.slice(0, 3));
    const hakkaUpper = Kakei.getHakka(shape.slice(3, 6));
    const catchMsg = CATCH_MESSAGES && CATCH_MESSAGES[kua.n] ? CATCH_MESSAGES[kua.n] : "";
    return `
      <div class="result-card">
        <h3>${label}</h3>
        <div class="kua-header">
          <span class="kua-symbol">${kua.symbol}</span>
          <span class="kua-name">${kua.name}</span>
          <span class="kua-number">第${kua.n}卦</span>
        </div>
        ${label === "本卦" && catchMsg ? `<div class="kua-catch">🏮 ${catchMsg}</div>` : ""}
        <div class="yin-yang-info">
          <span>上卦：${hakkaUpper.symbol} ${hakkaUpper.name}（${shape.slice(3)}）</span>
          <span>下卦：${hakkaLower.symbol} ${hakkaLower.name}（${shape.slice(0,3)}）</span>
        </div>
        ${note ? `<div class="henyo-row">${note}</div>` : ""}
        <p class="yaoji-kambun" style="margin-top:10px;">${kua.kaji}</p>
        <p class="yaoji-yakubun">${kua.kaji_yaku}</p>
        <p class="yaoji-gendai">${kua.kaji_gendai}</p>
        ${kua.kaji_voice ? `<div class="yaoji-voice">「 ${kua.kaji_voice} 」</div>` : ""}
      </div>
    `;
  }

  // ---------- 一般モード：卦の図（六爻の縦表示） ----------
  function yaoFigureHTML(c, shape) {
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const isYang = shape[i] === "1";
      const isHen = c.henyoPositions.includes(i + 1);
      const name = Kakei.YAO_NAMES[i];
      bars.push(`
        <div class="simple-yao">
          <span class="simple-yao-name">${name}</span>
          <div class="simple-yao-bar ${isYang ? "yang" : "yin"} ${isHen ? "henyo" : ""}"></div>
          <span class="simple-yao-parenthesis">${isHen ? "◆" : ""}</span>
        </div>
      `);
    }
    return `<div class="simple-yao-list">${bars.join("")}</div>`;
  }

  // ---------- 一般モード：結果表示 ----------
  function showSimpleResult(result, c, fortune) {
    const hon = c.honkaku;
    const shi = c.shikaku;
    const catchMsg = CATCH_MESSAGES && CATCH_MESSAGES[hon.n] ? CATCH_MESSAGES[hon.n] : "";

    let html = `<div class="simple-result">`;

    // 占意表示
    if (fortune) {
      html += `<div class="fortune-display" style="margin-bottom:16px;"><b>占意：</b>${fortune}</div>`;
    }

    // 本卦パネル
    html += `<div class="simple-kua-panel honkaku">`;
    html += `<span class="simple-kua-label">現在のあなた（本卦）</span>`;
    html += `<span class="simple-kua-symbol">${hon.symbol}</span>`;
    html += `<div class="simple-kua-name">${hon.name}</div>`;
    html += `<div class="simple-kua-number">第${hon.n}卦</div>`;
    if (catchMsg) html += `<div class="simple-kua-catch">🏮 ${catchMsg}</div>`;
    html += `<div class="simple-kua-junsei">${hon.kaji_gendai}</div>`;
    html += yaoFigureHTML(c, result.shape);
    if (c.henyoPositions.length > 0) {
      html += `<div class="henyo-row" style="margin-top:6px;"><b>変爻：</b>${c.henyoPositions.map(p => Kakei.YAO_NAMES_BY_POS[p]).join("・")}</div>`;
    }
    html += `</div>`;

    // 変化の矢印（変爻がある場合）
    if (c.henyoPositions.length > 0 && shi) {
      html += `<div class="simple-arrow">↓</div>`;
      html += `<div class="simple-arrow-label">変化した先の未来</div>`;
      html += `<div class="simple-kua-panel shikaku">`;
      html += `<span class="simple-kua-label">変化した未来（之卦）</span>`;
      html += `<span class="simple-kua-symbol">${shi.symbol}</span>`;
      html += `<div class="simple-kua-name">${shi.name}</div>`;
      html += `<div class="simple-kua-number">第${shi.n}卦</div>`;
      html += `<div class="simple-kua-junsei">${shi.kaji_gendai}</div>`;
      html += yaoFigureHTML(c, c.shikakuShape);
      html += `</div>`;
    }

    // 変卦（賓卦・裏卦・互卦）を簡素に折りたたみ表示
    const henCards = [
      { label: "相手から見たあなた", kua: c.hinkaku, shape: c.hinkakuShape },
      { label: "隠れた本音・本質", kua: c.rikaku, shape: c.rikakuShape },
      { label: "今まさに内部で起きていること", kua: c.goko, shape: c.gokoShape }
    ].filter(h => h.kua).map(h => {
      const voice = h.kua.kaji_voice ? `<div class="simple-henkaku-voice">「${h.kua.kaji_voice}」</div>` : "";
      return `
        <div class="simple-henkaku-card">
          <h4>${h.label}</h4>
          <span class="simple-henkaku-symbol">${h.kua.symbol}</span>
          <div class="simple-henkaku-name">${h.kua.name}</div>
          <div class="simple-henkaku-num">第${h.kua.n}卦</div>
          <div class="simple-henkaku-gendai">${h.kua.kaji_gendai}</div>
          ${voice}
        </div>
      `;
    }).join("");

    html += `
      <div class="simple-henkaku-fold">
        <button type="button" class="simple-fold-toggle" aria-expanded="false">
          <span class="fold-icon">▸</span> この卦の奥行きを見る
        </button>
        <div class="simple-fold-body">
          <div class="simple-henkaku-grid">${henCards}</div>
          <p class="simple-henkaku-note">これらの卦の関係は複雑です。詳しく知りたい方は式神による詳細鑑定をご利用ください。</p>
        </div>
      </div>
    `;

    html += `</div>`;

    resultSimpleEl.innerHTML = html;
    resultAreaSimple.style.display = "block";

    // 折りたたみトグル
    const foldToggle = resultSimpleEl.querySelector(".simple-fold-toggle");
    if (foldToggle) {
      foldToggle.addEventListener("click", () => {
        const expanded = foldToggle.getAttribute("aria-expanded") === "true";
        foldToggle.setAttribute("aria-expanded", String(!expanded));
        const body = foldToggle.nextElementSibling;
        body.style.display = expanded ? "none" : "block";
        const icon = foldToggle.querySelector(".fold-icon");
        if (icon) icon.textContent = expanded ? "▸" : "▾";
      });
    }

    // スクロール
    resultAreaSimple.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- 一般モード：お告げ（現代語訳を大きく） ----------
  function showSimpleYaoji(result) {
    const rule = Chusekiho.shushiRule(result.henIdx, result.calc);
    if (!rule) {
      yaojiAreaSimple.style.display = "none";
      return;
    }

    const honCatch = CATCH_MESSAGES && CATCH_MESSAGES[result.calc.honkaku.n]
      ? CATCH_MESSAGES[result.calc.honkaku.n] : "";

    let html = `<div class="simple-yaoji-rule">📖 ${rule.description}</div>`;
    if (honCatch) {
      html += `<div class="kua-catch">🏮 ${honCatch}</div>`;
    }
    html += `<div class="yaoji-oracle">天はあなたにこう告げている ——</div>`;

    const showKaji = rule.rule === "zero" || rule.rule === "three" || rule.rule === "six";

    if (showKaji) {
      const honVoice = result.calc.honkaku.kaji_voice ? `<div class="simple-yaoji-voice">「 ${result.calc.honkaku.kaji_voice} 」</div>` : "";
      const shiVoice = result.calc.shikaku && result.calc.shikaku.kaji_voice ? `<div class="simple-yaoji-voice">「 ${result.calc.shikaku.kaji_voice} 」</div>` : "";
      if (rule.rule === "zero") {
        html += `<div class="simple-yaoji-card main">
          <div class="simple-yaoji-label">本卦の卦辞</div>
          <div class="simple-yaoji-gendai">${result.calc.honkaku.kaji_gendai}</div>
          <hr class="simple-yaoji-divider">
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>${result.calc.honkaku.kaji}</div>
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>${result.calc.honkaku.kaji_yaku}</div>
          ${honVoice}
        </div>`;
      } else if (rule.rule === "three") {
        html += `<div class="simple-yaoji-card main">
          <div class="simple-yaoji-label">本卦の卦辞</div>
          <div class="simple-yaoji-gendai">${result.calc.honkaku.kaji_gendai}</div>
          <hr class="simple-yaoji-divider">
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>${result.calc.honkaku.kaji}</div>
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>${result.calc.honkaku.kaji_yaku}</div>
          ${honVoice}
        </div>`;
        html += `<div class="simple-yaoji-card jun">
          <div class="simple-yaoji-label">変化した卦（之卦）の卦辞</div>
          <div class="simple-yaoji-gendai">${result.calc.shikaku.kaji_gendai}</div>
          <hr class="simple-yaoji-divider">
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>${result.calc.shikaku.kaji}</div>
          <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>${result.calc.shikaku.kaji_yaku}</div>
          ${shiVoice}
        </div>`;
      } else if (rule.rule === "six") {
        if (result.calc.honkaku.n === 1) {
          html += `<div class="simple-yaoji-card main">
            <div class="simple-yaoji-label">乾 用九</div>
            <div class="simple-yaoji-gendai">集団の中で自分だけ秀でようとしないのが良い。</div>
            <hr class="simple-yaoji-divider">
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>見群龍无首。吉。</div>
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>群れの竜を見て、首（頭）をわざわざ出すことがない。吉。</div>
            <div class="simple-yaoji-voice">「首を出さず群れの龍、吉なり」</div>
          </div>`;
        } else if (result.calc.honkaku.n === 2) {
          html += `<div class="simple-yaoji-card main">
            <div class="simple-yaoji-label">坤 用六</div>
            <div class="simple-yaoji-gendai">「永く」（いつまでも続けられるよう）正しくあれ、という意味。</div>
            <hr class="simple-yaoji-divider">
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>利永貞。</div>
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>永く正しきに利ろし。</div>
            <div class="simple-yaoji-voice">「永く正しく、静かに地の如く」</div>
          </div>`;
        } else {
          html += `<div class="simple-yaoji-card main">
            <div class="simple-yaoji-label">変化した卦（之卦）の卦辞</div>
            <div class="simple-yaoji-gendai">${result.calc.shikaku.kaji_gendai}</div>
            <hr class="simple-yaoji-divider">
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>${result.calc.shikaku.kaji}</div>
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>${result.calc.shikaku.kaji_yaku}</div>
            ${shiVoice}
          </div>`;
        }
      }
    } else {
      // 爻辞を表示するケース（変爻1・2・4・5個）
      rule.list.forEach(item => {
        const kua = item.kua === "hon" ? result.calc.honkaku : result.calc.shikaku;
        if (item.pos === null) return;

        const yaoName = Kakei.YAO_NAMES[item.pos];
        const displayName = Kakei.yaoDisplayName(kua, item.pos);
        const yaoData = (kua.yao && kua.yao[item.pos]) ? kua.yao[item.pos] : null;

        const cls = item.main ? "main" : "jun";
        const label = (item.kua === "hon" ? "本卦" : "之卦") + " " + yaoName + "（" + displayName + "）" + (item.main ? " 〔主爻〕" : " 〔従爻〕");

        if (yaoData) {
          html += `<div class="simple-yaoji-card ${cls}">
            <div class="simple-yaoji-label">${label}</div>
            <div class="simple-yaoji-gendai">${yaoData.gendai}</div>
            <hr class="simple-yaoji-divider">
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">原文</span>${yaoData.kambun}</div>
            <div class="simple-yaoji-orthodox"><span class="simple-yaoji-orthodox-label">読み</span>${yaoData.yaku}</div>
            ${yaoData.voice ? `<div class="simple-yaoji-voice">「 ${yaoData.voice} 」</div>` : ""}
          </div>`;
        } else {
          html += `<div class="simple-yaoji-card ${cls}">
            <div class="simple-yaoji-label">${label}</div>
            <div class="simple-yaoji-gendai" style="color:#a82b2b;">※ この爻辞はデータ未収録です。易経をご参照ください。</div>
          </div>`;
        }
      });
    }

    yaojiSimpleEl.innerHTML = html;
    yaojiAreaSimple.style.display = "block";
  }

  // ---------- 結果表示 ----------
  function showResult() {
    const result = Chusekiho.fortune();
    // 実際の投げ結果を反映
    result.values = values;
    result.shape = Chusekiho.shapeFromValues(values);
    result.henIdx = Chusekiho.henIndicesFromValues(values);
    result.allCoins = null;
    result.yaoInfos = values.map(v => Chusekiho.yaoInfo(v));
    result.calc = Kakei.calcAll(result.shape, result.henIdx);
    const c = result.calc;

    // 占的テキスト取得
    const fortune = getFortuneText();

    // 一般モードなら簡易表示へ
    if (uiMode === "simple") {
      // 初回占い完了を記録（次回からは「一気に占う」を表示）
      markCeremonyDone();
      if (ceremonyNote) ceremonyNote.style.display = "none";

      showSimpleResult(result, c, fortune);
      showSimpleYaoji(result);
      lastResult = {
        ts: new Date().toISOString(),
        fortune: fortune,
        honkaku: c.honkaku ? { n: c.honkaku.n, name: c.honkaku.name } : null,
        shikaku: c.shikaku ? { n: c.shikaku.n, name: c.shikaku.name } : null,
        henyo: c.henyoPositions,
        kaji: c.honkaku ? c.honkaku.kaji : ""
      };
      saveHistory(lastResult);
      aiArea.style.display = "block";
      return;
    }

    // 変爻表示
    let henyoText;
    if (c.henyoPositions.length === 0) {
      henyoText = "変爻なし";
    } else {
      henyoText = c.henyoPositions.map(p => {
        const v = values[p - 1];
        const info = Chusekiho.yaoInfo(v);
        return `${Kakei.YAO_NAMES_BY_POS[p]}（${v}${info.name}）`;
      }).join("、") + " ◆変爻";
    }

    // 各爻の値の表示
    const valuesText = values.map((v, i) => {
      const info = Chusekiho.yaoInfo(v);
      return `<span>${Kakei.YAO_NAMES[i]}(<b>${v}</b> ${info.name}${info.hen ? ' <span style="color:#a82b2b;">◆</span>' : ""})</span>`;
    }).join(" ");

    // 結果HTML組み立て
    let html = "";
    if (fortune) {
      html += `<div class="fortune-display"><b>占意：</b>${fortune}</div>`;
    }
    html += `<div class="henyo-row"><b>爻値：</b>${valuesText}</div>`;
    html += `<div class="henyo-row"><b>${henyoText}</b></div>`;
    html += `<div class="kua-grid">`;
    html += kuaCard("本卦", c.honkaku, result.shape, "占いの現在の姿");
    if (c.henyoPositions.length > 0) {
      html += kuaCard("之卦", c.shikaku, c.shikakuShape, "変革後の未来・結果");
    }

    // 変卦三種（賓卦・裏卦・互卦）は折りたたみで表示
    const henKuaCards =
      kuaCard("賓卦", c.hinkaku, c.hinkakuShape, "相手（受け手）側から見た姿・逆視点") +
      kuaCard("裏卦", c.rikaku, c.rikakuShape, "表の陰に隠れた本質・潜在") +
      kuaCard("互卦", c.goko, c.gokoShape, "内部事情・途中経過・隠れた因果");
    html += `
      <div class="henkaku-fold">
        <button type="button" class="fold-toggle" aria-expanded="false">
          <span class="fold-icon">▸</span> 変卦を見る（賓卦・裏卦・互卦）
        </button>
        <div class="fold-body">
          <div class="kua-grid">${henKuaCards}</div>
        </div>
      </div>
    `;

    html += `</div>`;

    resultEl.innerHTML = html;
    resultArea.style.display = "block";

    // 折りたたみトグルを初期化（クリックで開閉）
    const foldToggle = resultEl.querySelector(".fold-toggle");
    if (foldToggle) {
      foldToggle.addEventListener("click", () => {
        const expanded = foldToggle.getAttribute("aria-expanded") === "true";
        foldToggle.setAttribute("aria-expanded", String(!expanded));
        const body = foldToggle.nextElementSibling;
        body.style.display = expanded ? "none" : "block";
        const icon = foldToggle.querySelector(".fold-icon");
        if (icon) icon.textContent = expanded ? "▸" : "▾";
      });
    }

    // 朱子ルールによる爻辞表示
    showYaoji(result);

    // 履歴保存（占的・本卦・之卦・変爻・卦辞）
    lastResult = {
      ts: new Date().toISOString(),
      fortune: fortune,
      honkaku: c.honkaku ? { n: c.honkaku.n, name: c.honkaku.name } : null,
      shikaku: c.shikaku ? { n: c.shikaku.n, name: c.shikaku.name } : null,
      henyo: c.henyoPositions,
      kaji: c.honkaku ? c.honkaku.kaji : ""
    };
    saveHistory(lastResult);

    // AIエリア表示
    aiArea.style.display = "block";
  }

  // ---------- 課金・プラン状態の表示管理（Square Checkout 導線） ----------

  // 課金エリア全体の表示を更新。ログイン状態・プラン状態に応じて出し分ける。
  async function updateAICreditDisplay() {
    const el = $("ai-credit");
    const billingArea = $("billing-area");
    if (!el) return;
    const loggedIn = !!(window.AppSupabase && window.AppSupabase.user);
    if (!loggedIn) {
      // 未ログイン：購入導線は出さない（ログイン案内のみ）
      el.innerHTML = `<span class="ai-credit-free">※ 式神の託宣にはログインが必要です。</span>`;
      if (billingArea) billingArea.style.display = "none";
      return;
    }

    el.innerHTML = ``;

    // プラン状態を取得（初回無料・チケット・サブスク）
    let plans = null;
    try {
      plans = await window.AppSupabase.getPlans();
    } catch (e) {
      // /api/plans が失敗しても致命的でない。静かに購入導線だけ隠す
      console.error("プラン取得エラー:", e.message);
      if (billingArea) billingArea.style.display = "none";
      return;
    }

    const hasFree = !!plans.freeAvailable;
    const credits = plans.oneTimeCredits || 0;
    const sub = plans.subscription || { active: false, status: "none" };
    const subActive = !!sub.active;

    // 無料枠が残っていて・チケットも無し・サブスクも無し → 買い物エリアは出さない
    // （初回ユーザーには課金を押し付けない。402 が出た時点で表示する）
    const shouldShowBilling = !(hasFree && credits === 0 && !subActive);

    if (billingArea) {
      billingArea.style.display = shouldShowBilling ? "block" : "none";
    }

    // プラン状態の詳細表示（残チケット・サブスク・解約ボタン）
    updateBillingStatus({ plans, hasFree, credits, sub, subActive });
  }

  // 「現在のプラン状態」エリアの描画
  function updateBillingStatus({ plans, hasFree, credits, sub, subActive }) {
    const statusEl = $("billing-status");
    const btnSingle = $("btn-buy-single");
    const btnMonthly = $("btn-buy-monthly");
    if (!statusEl) return;

    let html = "";
    if (subActive) {
      // サブスク有効
      html += `<div class="billing-badge active">✅ 月額プラン有効中（無制限）</div>`;
      if (sub.currentPeriodEnd) {
        const d = new Date(sub.currentPeriodEnd);
        html += `<p class="billing-period">有効期限: ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}</p>`;
      }
    } else {
      if (hasFree) {
        html += `<div class="billing-badge free">🎴 初回の託宣は無料（未使用）</div>`;
      }
      if (credits > 0) {
        html += `<div class="billing-badge credit">🎫 残チケット: ${credits} 枚</div>`;
      }
      if (sub.status && sub.status !== "none") {
        html += `<div class="billing-badge">💳 サブスク状態: ${sub.status}</div>`;
      }
    }

    // サブスク有効時は購入ボタンを無効化し、解約ボタンを出す
    if (subActive) {
      if (btnSingle) { btnSingle.disabled = true; btnSingle.textContent = "サブスク利用中"; }
      if (btnMonthly) { btnMonthly.disabled = true; btnMonthly.textContent = "登録済み"; }
      // 解約ボタン（動的）
      html += `<button id="btn-cancel-sub" class="btn btn-cancel">サブスクを解約する</button>`;
    } else {
      if (btnSingle) { btnSingle.disabled = false; btnSingle.textContent = "500円で購入"; }
      if (btnMonthly) { btnMonthly.disabled = false; btnMonthly.textContent = "月額2,980円に登録"; }
    }

    statusEl.innerHTML = html;

    // 解約ボタンにイベント登録
    const cancelBtn = $("btn-cancel-sub");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", onCancelSubscription);
    }
  }

  // 単発購入（Square Checkout URL へリダイレクト）
  async function onBuySingle() {
    try {
      btnAi.disabled = true;
      const url = await window.AppSupabase.createCheckout("single_500");
      aiOutput.innerHTML = `<p class="hint">Square の決済画面へ移動しています…</p>`;
      window.location.href = url;
    } catch (e) {
      aiOutput.innerHTML = `<p class="ai-error">⚠️ ${e.message}</p>`;
      btnAi.disabled = false;
    }
  }

  // 月額サブスク登録（Square Checkout URL へリダイレクト）
  async function onBuyMonthly() {
    try {
      btnAi.disabled = true;
      const url = await window.AppSupabase.createCheckout("monthly_2980");
      aiOutput.innerHTML = `<p class="hint">Square の決済画面へ移動しています…</p>`;
      window.location.href = url;
    } catch (e) {
      aiOutput.innerHTML = `<p class="ai-error">⚠️ ${e.message}</p>`;
      btnAi.disabled = false;
    }
  }

  // サブスク解約
  async function onCancelSubscription() {
    if (!confirm("サブスクを解約しますか？期間満了日までご利用いただけます。")) return;
    try {
      const result = await window.AppSupabase.cancelSubscription();
      aiOutput.innerHTML = `<p class="hint">✅ ${result.message || "解約を予約しました。"}</p>`;
      // 状態を再取得
      updateAICreditDisplay();
    } catch (e) {
      aiOutput.innerHTML = `<p class="ai-error">⚠️ ${e.message}</p>`;
    }
  }

  // ---------- 式神解釈: Worker 経由で呼び出し（プロンプト・APIキーはサーバー側に秘匿） ----------
  const AI_WORKER_URL = "https://eki-sen-ai-proxy.hiromun39.workers.dev";

  async function callAIWorker(accessToken, payload) {
    const res = await fetch(AI_WORKER_URL + "/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 402 = 有料プラン必要（初回無料を使い切った）
      if (res.status === 402) {
        const err = new Error(data.error || "初回の無料枠はご利用済みです。");
        err.code = "PAYMENT_REQUIRED";
        throw err;
      }
      if (res.status === 401) {
        const err = new Error(data.error || "ログインが必要です。");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }
      throw new Error(data.error || `エラー (${res.status})`);
    }

    if (!data.text) throw new Error("応答が空でした。");
    return data.text;
  }

  // 式神解釈のリクエストデータ構築（占い結果をサーバーへ送る）
  function buildAIRequestPayload() {
    const result = Chusekiho.fortune();
    result.values = values;
    result.shape = Chusekiho.shapeFromValues(values);
    result.henIdx = Chusekiho.henIndicesFromValues(values);
    result.calc = Kakei.calcAll(result.shape, result.henIdx);
    const c = result.calc;

    // 読むべき爻辞（朱子ルール）
    let yaojiText = "";
    const rule = Chusekiho.shushiRule(result.henIdx, c);
    if (rule) {
      yaojiText += rule.description + "\n";
      rule.list.forEach(item => {
        if (item.pos === null) return;
        const kua = item.kua === "hon" ? c.honkaku : c.shikaku;
        const yaoData = kua.yao && kua.yao[item.pos] ? kua.yao[item.pos] : null;
        if (yaoData) {
          const label = (item.kua === "hon" ? "本卦" : "之卦") + " " + Kakei.YAO_NAMES[item.pos] + (item.main ? "〔主〕" : "〔従〕");
          yaojiText += `・${label}: ${yaoData.kambun} / 現代語訳: ${yaoData.gendai} / 天の声: ${yaoData.voice || "なし"}\n`;
        }
      });
    } else {
      yaojiText = `本卦 卦辞: ${c.honkaku.kaji} / 現代語訳: ${c.honkaku.kaji_gendai} / 天の声: ${c.honkaku.kaji_voice || "なし"}`;
    }

    // 変卦（賓卦・裏卦・互卦）の参考情報
    const henRef = [
      c.hinkaku ? `賓卦: ${c.hinkaku.name}（第${c.hinkaku.n}卦） 相手側から見たあなたの姿` : "",
      c.rikaku ? `裏卦: ${c.rikaku.name}（第${c.rikaku.n}卦） 隠れた本質` : "",
      c.goko ? `互卦: ${c.goko.name}（第${c.goko.n}卦） 内部で進行中の事情` : ""
    ].filter(Boolean).join("\n");

    return {
      fortune: getFortuneText(),
      values: values,
      honkaku: c.honkaku ? { n: c.honkaku.n, name: c.honkaku.name, symbol: c.honkaku.symbol, kaji_gendai: c.honkaku.kaji_gendai } : null,
      shikaku: c.shikaku ? { n: c.shikaku.n, name: c.shikaku.name, symbol: c.shikaku.symbol, kaji_gendai: c.shikaku.kaji_gendai } : null,
      henIndex: c.henyoPositions,
      yaojiText: yaojiText,
      henRef: henRef
    };
  }

  // ---------- 「式神の託宣を受ける」ボタン ----------
  async function onAiClick() {
    if (isBusy || values.length < 6) return;
    isBusy = true;
    btnAi.disabled = true;

    aiOutput.innerHTML = `<p class="hint">🔮 四雲先生の式神が占意を読み解いています…</p>`;

    try {
      // ログイン必須（初回無料はログインが必要）
      if (!window.AppSupabase || !window.AppSupabase.user) {
        const err = new Error("式神の託宣を受けるにはログインが必要です。");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }
      const accessToken = await window.AppSupabase.getAccessToken();
      if (!accessToken) {
        const err = new Error("ログインセッションを取得できませんでした。再ログインしてください。");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }

      const payload = buildAIRequestPayload();
      const response = await callAIWorker(accessToken, payload);

      // AI解釈を履歴に保存
      saveAIResult(response, "ai");
      aiOutput.innerHTML = renderAIResponse(response);
      aiOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (err.code === "PAYMENT_REQUIRED") {
        aiOutput.innerHTML = `<p class="ai-error">⚠️ ${err.message}</p><p class="hint">2回目以降の利用は有料プラン（近日実装予定）になります。よろしければ四雲先生の本鑑定をご検討ください。</p>`;
      } else if (err.code === "NOT_AUTHENTICATED") {
        aiOutput.innerHTML = `<p class="ai-error">🔐 ${err.message}</p><p class="hint">無料ログイン（Google連携）で、初回の式神の託宣を無料でお試しいただけます。占い結果も自動で履歴に保存されます。</p>`;
      } else {
        aiOutput.innerHTML = `<p class="ai-error">⚠️ エラー: ${err.message}</p><p class="hint">時間をおいて再度お試しください。</p>`;
      }
    } finally {
      isBusy = false;
      btnAi.disabled = false;
    }
  }

  // ---------- API応答をHTML表示 ----------
  function renderAIResponse(text) {
    const paragraphs = String(text).split(/\n+/).filter(p => p.trim() !== "");
    return `
      <div class="ai-mock">
        <div class="ai-kami">✨ 式神の託宣</div>
        ${paragraphs.map(p => {
          if (/^1\.|^2\.|^3\.|^4\./.test(p)) {
            return `<p class="ai-lead">${p}</p>`;
          }
          if (/🏮/.test(p)) {
            return `<p class="ai-catch">${p}</p>`;
          }
          return `<p>${p}</p>`;
        }).join("")}
        <div class="ai-disclaimer">
          <p>こちらは式神による参考解釈です。さらに深い鑑定は四雲先生にご相談ください。</p>
        </div>
      </div>
    `;
  }

  // ---------- テスト表示（任意の卦を確認） ----------
  function initTestArea() {
    const sel = $("test-kua-select");
    const btnShow = $("btn-test-show");
    const btnClear = $("btn-test-clear");
    const testResult = $("test-result");
    if (!sel || !btnShow || !testResult) return;

    // 卦リストをセレクトに設定
    R64.kua.forEach(k => {
      const opt = document.createElement("option");
      opt.value = String(k.n);
      opt.textContent = `第${k.n}卦 ${k.name}（${k.symbol}）`;
      sel.appendChild(opt);
    });

    btnShow.addEventListener("click", () => {
      const n = parseInt(sel.value, 10);
      const kua = R64.kua.find(k => k.n === n);
      if (!kua) return;

      let html = "";
      html += `<div class="result-card">`;
      html += `<div class="kua-header">`;
      html += `<span class="kua-symbol">${kua.symbol}</span>`;
      html += `<span class="kua-name">${kua.name}</span>`;
      html += `<span class="kua-number">第${kua.n}卦</span>`;
      html += `</div>`;
      const catchMsg = CATCH_MESSAGES && CATCH_MESSAGES[kua.n] ? CATCH_MESSAGES[kua.n] : "";
      if (catchMsg) html += `<div class="kua-catch">🏮 ${catchMsg}</div>`;

      // 卦辞
      html += `<div class="yaoji-card main">`;
      html += `<div class="yaoji-label">卦辞</div>`;
      html += `<div class="yaoji-kambun">${kua.kaji}</div>`;
      html += `<div class="yaoji-yakubun">${kua.kaji_yaku}</div>`;
      html += `<div class="yaoji-gendai">${kua.kaji_gendai}</div>`;
      if (kua.kaji_voice) html += `<div class="yaoji-voice">「 ${kua.kaji_voice} 」</div>`;
      html += `</div>`;

      // 6爻すべて
      const yao = kua.yao && kua.yao.length === 6 ? kua.yao : null;
      if (yao) {
        const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
        yao.forEach((yd, i) => {
          html += `<div class="yaoji-card jun">`;
          html += `<div class="yaoji-label">${YAO_NAMES[i]}</div>`;
          html += `<div class="yaoji-kambun">${yd.kambun}</div>`;
          html += `<div class="yaoji-yakubun">${yd.yaku}</div>`;
          html += `<div class="yaoji-gendai">${yd.gendai}</div>`;
          if (yd.voice) html += `<div class="yaoji-voice">「 ${yd.voice} 」</div>`;
          html += `</div>`;
        });
      } else {
        html += `<div class="yaoji-gendai" style="color:#a82b2b;">※ この卦の爻辞は未収録です。</div>`;
      }
      html += `</div>`;

      testResult.innerHTML = html;
    });

    btnClear.addEventListener("click", () => {
      testResult.innerHTML = "";
    });
  }

  // ---------- AIエリア初期化 ----------
  function initAIArea() {
    updateAICreditDisplay();
  }

  // ---------- JSONバックアップ ----------
  function exportJSON() {
    const history = getHistory();
    if (history.length === 0) {
      alert("まだ占い履歴がありません。");
      return;
    }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `中筮法_易占バックアップ_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- 履歴全削除 ----------
  function clearAllHistory() {
    if (!confirm("全削除しますか？\n先に「JSONでバックアップ」を推奨します。")) return;
    try {
      localStorage.setItem("eki-sen-history", "[]");
      showHistory();
    } catch (e) {}
  }

  // ---------- 履歴表示初期化 ----------
  function initHistoryArea() {
    const btnHistory = $("btn-history");
    const btnExport = $("btn-export");
    const btnJson = $("btn-export-json");
    const btnClearAll = $("btn-clear-all");
    if (btnHistory) btnHistory.addEventListener("click", showHistory);
    if (btnExport) btnExport.addEventListener("click", exportCSV);
    if (btnJson) btnJson.addEventListener("click", exportJSON);
    if (btnClearAll) btnClearAll.addEventListener("click", clearAllHistory);
    // DOMContentLoaded 後に初回表示
    updateHistoryCount();
    showHistory();
  }

  // ---------- 爻辞表示 ----------
  function showYaoji(result) {
    const rule = Chusekiho.shushiRule(result.henIdx, result.calc);
    if (!rule) {
      yaojiArea.style.display = "none";
      return;
    }

    const honCatch = CATCH_MESSAGES && CATCH_MESSAGES[result.calc.honkaku.n]
      ? CATCH_MESSAGES[result.calc.honkaku.n] : "";

    let html = `<div class="yaoji-rule">📖 ${rule.description}</div>`;
    if (honCatch) {
      html += `<div class="kua-catch">🏮 ${honCatch}</div>`;
    }
    html += `<div class="yaoji-oracle">天はあなたにこう告げている ——</div>`;

    // 卦辞を表示するケース（変爻0・3・6個）
    const showKaji = rule.rule === "zero" || rule.rule === "three" || rule.rule === "six";

    if (showKaji) {
      const honVoice = result.calc.honkaku.kaji_voice ? `<div class="yaoji-voice">「 ${result.calc.honkaku.kaji_voice} 」</div>` : "";
      const shiVoice = result.calc.shikaku && result.calc.shikaku.kaji_voice ? `<div class="yaoji-voice">「 ${result.calc.shikaku.kaji_voice} 」</div>` : "";
      if (rule.rule === "zero") {
        html += `<div class="yaoji-card main">
          <div class="yaoji-label">本卦 卦辞</div>
          <div class="yaoji-kambun">${result.calc.honkaku.kaji}</div>
          <div class="yaoji-yakubun">${result.calc.honkaku.kaji_yaku}</div>
          <div class="yaoji-gendai">${result.calc.honkaku.kaji_gendai}</div>
          ${honVoice}
        </div>`;
      } else if (rule.rule === "three") {
        html += `<div class="yaoji-card main">
          <div class="yaoji-label">本卦 卦辞</div>
          <div class="yaoji-kambun">${result.calc.honkaku.kaji}</div>
          <div class="yaoji-yakubun">${result.calc.honkaku.kaji_yaku}</div>
          <div class="yaoji-gendai">${result.calc.honkaku.kaji_gendai}</div>
          ${honVoice}
        </div>`;
        html += `<div class="yaoji-card jun">
          <div class="yaoji-label">之卦 卦辞</div>
          <div class="yaoji-kambun">${result.calc.shikaku.kaji}</div>
          <div class="yaoji-yakubun">${result.calc.shikaku.kaji_yaku}</div>
          <div class="yaoji-gendai">${result.calc.shikaku.kaji_gendai}</div>
          ${shiVoice}
        </div>`;
      } else if (rule.rule === "six") {
        // 変爻6個：乾は用九、坤は用六
        if (result.calc.honkaku.n === 1) {
          html += `<div class="yaoji-card main">
            <div class="yaoji-label">乾 用九</div>
            <div class="yaoji-kambun">見群龍无首。吉。</div>
            <div class="yaoji-yakubun">群れの竜を見て、首（頭）をわざわざ出すことがない。吉。</div>
            <div class="yaoji-gendai">集団の中で自分だけ秀でようとしないのが良い。</div>
            <div class="yaoji-voice">「首を出さず群れの龍、吉なり」</div>
          </div>`;
        } else if (result.calc.honkaku.n === 2) {
          html += `<div class="yaoji-card main">
            <div class="yaoji-label">坤 用六</div>
            <div class="yaoji-kambun">利永貞。</div>
            <div class="yaoji-yakubun">永く正しきに利ろし。</div>
            <div class="yaoji-gendai">「永く」（いつまでも続けられるよう）正しくあれ、という意味。</div>
            <div class="yaoji-voice">「永く正しく、静かに地の如く」</div>
          </div>`;
        } else {
          html += `<div class="yaoji-card main">
            <div class="yaoji-label">之卦 卦辞</div>
            <div class="yaoji-kambun">${result.calc.shikaku.kaji}</div>
            <div class="yaoji-yakubun">${result.calc.shikaku.kaji_yaku}</div>
            <div class="yaoji-gendai">${result.calc.shikaku.kaji_gendai}</div>
            ${shiVoice}
          </div>`;
        }
      }
    } else {
      // 爻辞を表示するケース（変爻1・2・4・5個）
      rule.list.forEach(item => {
        const kua = item.kua === "hon" ? result.calc.honkaku : result.calc.shikaku;
        if (item.pos === null) return;

        const yaoName = Kakei.YAO_NAMES[item.pos];
        const displayName = Kakei.yaoDisplayName(kua, item.pos);
        const yaoData = (kua.yao && kua.yao[item.pos]) ? kua.yao[item.pos] : null;

        const cls = item.main ? "main" : "jun";
        const label = (item.kua === "hon" ? "本卦" : "之卦") + " " + yaoName + "（" + displayName + "）" + (item.main ? " 〔主爻〕" : " 〔従爻〕");

        if (yaoData) {
          html += `<div class="yaoji-card ${cls}">
            <div class="yaoji-label">${label}</div>
            <div class="yaoji-kambun">${yaoData.kambun}</div>
            <div class="yaoji-yakubun">${yaoData.yaku}</div>
            <div class="yaoji-gendai">${yaoData.gendai}</div>
            ${yaoData.voice ? `<div class="yaoji-voice">「 ${yaoData.voice} 」</div>` : ""}
          </div>`;
        } else {
          html += `<div class="yaoji-card ${cls}">
            <div class="yaoji-label">${label}</div>
            <div class="yaoji-gendai" style="color:#a82b2b;">※ この爻辞はデータ未収録です。易経をご参照ください。</div>
          </div>`;
        }
      });
    }

    yaojiEl.innerHTML = html;
    yaojiArea.style.display = "block";

    // ページ下部へスクロール
    yaojiArea.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- リセット ----------
  function reset() {
    values = [];
    tossCount = 0;
    isBusy = false;

    yaoResult.textContent = "—";
    yaoResult.classList.remove("active");
    [coin1, coin2, coin3].forEach(el => {
      el.textContent = "?";
      el.className = "coin";
    });
    yaoSlots.forEach(slot => {
      slot.innerHTML = slot.dataset.idx === "0" ? "初爻" : slot.dataset.idx === "5" ? "上爻" : "";
      slot.classList.remove("filled");
    });
    resultArea.style.display = "none";
    yaojiArea.style.display = "none";
    aiArea.style.display = "none";
    resultEl.innerHTML = "";
    yaojiEl.innerHTML = "";

    // 一般モード用もリセット
    if (resultAreaSimple) resultAreaSimple.style.display = "none";
    if (yaojiAreaSimple) yaojiAreaSimple.style.display = "none";
    if (resultSimpleEl) resultSimpleEl.innerHTML = "";
    if (yaojiSimpleEl) yaojiSimpleEl.innerHTML = "";

    // 初回儀式でなければ進捗を隠す（一般モード）
    if (progressEl) progressEl.style.display = uiMode === "simple" ? "none" : "block";
    if (ceremonyNote) ceremonyNote.style.display = uiMode === "simple" && !isCeremonyDone() ? "block" : "none";

    // ボタン：初回儀式モード（一度も占い完了していない場合）のみ「一気に占う」を隠す
    if (isCeremonyDone() || uiMode === "academic") {
      btnSkip.style.display = "inline-block";
    } else {
      btnSkip.style.display = "none";
    }
    btnToss.style.display = "inline-block";
    btnReset.style.display = "none";
    btnToss.disabled = false;
    btnSkip.disabled = false;
  }

  // ---------- 認証UI初期化 ----------
  function initAuthArea() {
    const btnLogin = $("btn-login");
    const btnLogout = $("btn-logout");
    const authUser = $("auth-user");
    if (!btnLogin || !btnLogout || !authUser) return;

    // ログインボタン
    btnLogin.addEventListener("click", async () => {
      if (window.AppSupabase) {
        await window.AppSupabase.signInWithGoogle();
      }
    });

    // ログアウトボタン
    btnLogout.addEventListener("click", async () => {
      if (window.AppSupabase) {
        await window.AppSupabase.signOut();
        showHistory();
      }
    });

    // 認証状態監視
    if (window.AppSupabase) {
      // 同期の二重実行防止フラグ
      let isSyncing = false;
      window.AppSupabase.init(async (user) => {
        if (user) {
          // ログイン済み
          btnLogin.style.display = "none";
          btnLogout.style.display = "inline-block";
          const name = user.user_metadata?.full_name || user.email || "ユーザー";
          authUser.textContent = `👤 ${name}`;
          authUser.style.display = "inline-block";

          // 同期済みならスキップ（onAuthStateChange と getSession の二重呼び出し対策）
          if (isSyncing) return;
          isSyncing = true;
          try {
            // ① localStorage → DB へアップロード（先にローカルの未同期分を送る）
            await window.AppSupabase.syncLocalToDB();
            // ② DB → localStorage へ反映（最新の統合結果でローカルを更新）
            await window.AppSupabase.fetchHistoryFromDB();
          } finally {
            isSyncing = false;
          }
          showHistory();
        } else {
          // 未ログイン
          btnLogin.style.display = "inline-block";
          btnLogout.style.display = "none";
          authUser.style.display = "none";
        }
      });
    }
  }

  // ---------- コイン投げ1回 ----------
  function tossOne() {
    // 合計で6回まで
    if (tossCount >= 6 || isBusy) return;

    isBusy = true;
    btnToss.disabled = true;
    btnSkip.disabled = true;

    // 初回投げでプログレスを表示
    if (tossCount === 0 && progressEl) progressEl.style.display = "block";

    const { coins, total } = Chusekiho.tossThree();
    setCoins(coins);

    setTimeout(() => {
      values.push(total);
      tossCount++;
      showYaoResult(total);
      updateSlots();

      isBusy = false;

      if (tossCount >= 6) {
        // 完了：結果表示
        btnToss.style.display = "none";
        btnSkip.style.display = "none";
        btnReset.style.display = "inline-block";
        setTimeout(showResult, 400);
      } else {
        btnToss.disabled = false;
        btnSkip.disabled = false;
      }
    }, 600);
  }

  // ---------- 一括実行 ----------
  function tossAll() {
    if (isBusy) return;
    isBusy = true;
    btnToss.disabled = true;
    btnSkip.disabled = true;

    // 残り回数を投げる（一気に占う場合はコインアニメなしで全6爻を確定させる）
    for (let i = tossCount; i < 6; i++) {
      const { total } = Chusekiho.tossThree();
      values.push(total);
      tossCount++;
    }
    updateSlots();
    btnToss.style.display = "none";
    btnSkip.style.display = "none";
    btnReset.style.display = "inline-block";

    setTimeout(() => {
      showResult();
      isBusy = false;
    }, 500);
  }

  // ---------- イベント登録 ----------
  document.addEventListener("DOMContentLoaded", () => {
    try {
      if (!checkData()) return;

      // モード初期化
      uiMode = getUIMode();
      applyUIMode();

      // 初期化リセット（一気に占うボタンの表示判定を行う）
      try { reset(); } catch (e) { console.error("初期resetエラー:", e); }

      // テスト表示（?test=1 時のみ）
      const params = new URLSearchParams(window.location.search);
      if (params.get("test") === "1" && testArea) testArea.style.display = "block";

      // 説明の折りたたみ
      if (introSimpleHead && introSimpleBody) {
        introSimpleHead.addEventListener("click", () => {
          const hidden = introSimpleBody.style.display === "none";
          introSimpleBody.style.display = hidden ? "block" : "none";
          if (introFoldIcon) introFoldIcon.classList.toggle("open", hidden);
        });
        // 初回儀式時は開いたまま
        if (!isCeremonyDone()) introSimpleBody.style.display = "block";
        else introSimpleBody.style.display = "none";
      }

      // モード切替
      if (btnModeToggle) {
        btnModeToggle.addEventListener("click", () => {
          setUIMode(uiMode === "academic" ? "simple" : "academic");
        });
      }

      // 各初期化は例外を握りつぶして、ボタン登録を確実に行う
      try { initAuthArea(); } catch (e) { console.error("initAuthArea:", e); }
      try { initTestArea(); } catch (e) { console.error("initTestArea:", e); }
      try { initHistoryArea(); } catch (e) { console.error("initHistoryArea:", e); }
      try { initAIArea(); } catch (e) { console.error("initAIArea:", e); }
    } catch (e) {
      console.error("初期化エラー:", e);
    }
    // ボタン登録は必ず行う
    try { btnToss.addEventListener("click", tossOne); } catch (e) {}
    try { btnSkip.addEventListener("click", tossAll); } catch (e) {}
    try { btnReset.addEventListener("click", reset); } catch (e) {}
    if (btnAi) { try { btnAi.addEventListener("click", onAiClick); } catch (e) {} }
    if (fortuneText) {
      fortuneText.addEventListener("input", updateCount);
      try { updateCount(); } catch (e) {}
    }
    // 課金ボタン登録（購入・解約）
    const btnBuySingle = $("btn-buy-single");
    const btnBuyMonthly = $("btn-buy-monthly");
    if (btnBuySingle) { try { btnBuySingle.addEventListener("click", onBuySingle); } catch (e) {} }
    if (btnBuyMonthly) { try { btnBuyMonthly.addEventListener("click", onBuyMonthly); } catch (e) {} }
  });

})();
