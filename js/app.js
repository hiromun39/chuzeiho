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
  const dataStatus = $("data-status");
  const fortuneText = $("fortune-text");
  const inputCount = $("input-count");

  // ---------- 状態 ----------
  let values = [];      // 得られた爻値（初爻→上爻）
  let tossCount = 0;    // 投げた回数
  let isBusy = false;   // 忙しいフラグ
  let lastResult = null; // 最後の占い結果（履歴保存用）

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

  // ---------- 履歴保存（localStorage・将来のサーバー連携用） ----------
  function saveHistory(record) {
    try {
      const key = "eki-sen-history";
      let history = [];
      try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
      history.push(record);
      if (history.length > 50) history = history.slice(-50); // 最大50件
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) { /* localStorage が使えない環境向けに無視 */ }
  }

  // ---------- 履歴を取得 ----------
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem("eki-sen-history") || "[]");
    } catch (e) {
      return [];
    }
  }

  // ---------- 履歴表示 ----------
  function showHistory() {
    const history = getHistory();
    const container = $("history-list");
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = `<p class="history-empty">まだ占い履歴がありません。占いを行うと自動的に記録されます。</p>`;
      return;
    }

    // 新しい順に表示
    const rows = [...history].reverse().map((h, i) => {
      const d = new Date(h.ts);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const hon = h.honkaku ? `<b>${h.honkaku.name}</b>（第${h.honkaku.n}卦）` : "—";
      const shi = h.shikaku ? `${h.shikaku.name}（第${h.shikaku.n}卦）` : "—";
      const fortune = h.fortune ? `<div class="history-fortune">${h.fortune}</div>` : "";
      return `
        <div class="history-item">
          <div class="history-date">${dateStr}</div>
          <div class="history-body">
            <div class="history-kua">本卦 ${hon} ${h.henyo && h.henyo.length > 0 ? `／ 之卦 ${shi}` : ""}</div>
            ${fortune}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = rows.join("");
  }

  // ---------- CSVエクスポート ----------
  function exportCSV() {
    const history = getHistory();
    if (history.length === 0) {
      alert("まだ占い履歴がありません。");
      return;
    }

    // BOM付きCSV（Excelで文字化けしないように）
    const header = "日時,占的,本卦,本卦番号,之卦,之卦番号,変爻,卦辞\n";
    const rows = history.map(h => {
      const d = new Date(h.ts);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const fortune = (h.fortune || "").replace(/"/g, '""');
      const hon = h.honkaku ? `${h.honkaku.name}` : "";
      const shi = h.shikaku ? `${h.shikaku.name}` : "";
      const henyo = h.henyo && h.henyo.length > 0 ? h.henyo.join(",") : "";
      const kaji = (h.kaji || "").replace(/"/g, '""');
      return `"${dateStr}","${fortune}","${hon}","${h.honkaku ? h.honkaku.n : ""}","${shi}","${h.shikaku ? h.shikaku.n : ""}","${henyo}","${kaji}"`;
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
    if (R64 && R64.kua && R64.kua.length === 64) {
      const yaoCount = mergeYaoji();
      dataStatus.textContent = `✓ 六十四卦データ ロード済み（64卦 / ${yaoCount}爻辞）`;
      dataStatus.classList.add("loaded");
      return true;
    }
    dataStatus.textContent = "⚠ 六十四卦データの読み込みに失敗";
    return false;
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

  // ---------- AIモック応答（デモ用） ----------
  function generateMockInterpretation() {
    const result = Chusekiho.fortune();
    result.values = values;
    result.shape = Chusekiho.shapeFromValues(values);
    result.henIdx = Chusekiho.henIndicesFromValues(values);
    result.calc = Kakei.calcAll(result.shape, result.henIdx);
    const c = result.calc;
    const hon = c.honkaku;
    const catchMsg = CATCH_MESSAGES && CATCH_MESSAGES[hon.n] ? CATCH_MESSAGES[hon.n] : "";

    const fortune = getFortuneText();
    let html = `<div class="ai-mock">`;
    html += `<div class="ai-kami">✨ 陰陽師の統合解釈</div>`;
    if (fortune) html += `<p class="ai-fortune">占意「${fortune}」について天は告げる ──</p>`;
    html += `<p class="ai-lead">本卦「${hon.name}」（第${hon.n}卦）が告げるのは──</p>`;
    if (catchMsg) html += `<p class="ai-catch">🏮 ${catchMsg}</p>`;

    // 変爻情報
    const henCount = result.henIdx.length;
    if (henCount === 0) {
      html += `<p>変爻はなく、天は卦全体の卦辞にだけ答えを込めています。</p>`;
      html += `<p class="ai-kambun">「${hon.kaji}」</p>`;
      html += `<p>${hon.kaji_gendai}</p>`;
    } else {
      const henyao = c.henyoPositions.map(p => {
        return `${Kakei.YAO_NAMES_BY_POS[p]}（${Chusekiho.yaoInfo(values[p-1]).name}）`;
      }).join("と");
      html += `<p>変爻は${henyao}。これらの爻があなたの現状に強く働きかけています。</p>`;

      // 朱子ルールで読むべき箇所
      const rule = Chusekiho.shushiRule(result.henIdx, c);
      if (rule) {
        rule.list.forEach(item => {
          if (item.pos === null) return;
          const kua = item.kua === "hon" ? c.honkaku : c.shikaku;
          const yaoData = kua.yao && kua.yao[item.pos] ? kua.yao[item.pos] : null;
          const label = (item.kua === "hon" ? "本卦" : "之卦") + " " + Kakei.YAO_NAMES[item.pos] + (item.main ? "〔主〕" : "〔従〕");
          if (yaoData) {
            html += `<div class="ai-yao">`;
            html += `<div class="ai-yao-label">${label}</div>`;
            html += `<div class="ai-kambun">「${yaoData.kambun}」</div>`;
            html += `<div class="ai-gendai">${yaoData.gendai}</div>`;
            html += `</div>`;
          }
        });
      }
    }

    // 之卦
    if (c.henyoPositions.length > 0) {
      const shiCatch = CATCH_MESSAGES && CATCH_MESSAGES[c.shikaku.n] ? CATCH_MESSAGES[c.shikaku.n] : "";
      html += `<p class="ai-future">将来は「${c.shikaku.name}」（第${c.shikaku.n}卦）へと向かいます。</p>`;
      if (shiCatch) html += `<p class="ai-catch">🏮 ${shiCatch}</p>`;
    }

    html += `<div class="ai-disclaimer">`;
    html += `<p>⚠️ これは自動生成された参考解釈です。</p>`;
    html += `<p>陰陽師による本格的な統合解釈は、近日リリース予定です 🔑</p>`;
    html += `</div>`;
    html += `</div>`;
    return html;
  }

  // ---------- 「解釈する」ボタン ----------
  function onAiClick() {
    if (isBusy || values.length < 6) return;
    isBusy = true;
    btnAi.disabled = true;
    aiOutput.innerHTML = `<p class="hint">🔮 占意を読み解いています…</p>`;
    setTimeout(() => {
      aiOutput.innerHTML = generateMockInterpretation();
      isBusy = false;
      btnAi.disabled = false;
      aiOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 800);
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

  // ---------- 履歴表示初期化 ----------
  function initHistoryArea() {
    const btnHistory = $("btn-history");
    const btnExport = $("btn-export");
    if (btnHistory) btnHistory.addEventListener("click", showHistory);
    if (btnExport) btnExport.addEventListener("click", exportCSV);
    // DOMContentLoaded 後に初回表示
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

    btnToss.style.display = "inline-block";
    btnSkip.style.display = "inline-block";
    btnToss.disabled = false;
    btnSkip.disabled = false;
  }

  // ---------- コイン投げ1回 ----------
  function tossOne() {
    // 合計で6回まで
    if (tossCount >= 6 || isBusy) return;

    isBusy = true;
    btnToss.disabled = true;
    btnSkip.disabled = true;

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

    // 残り回数を投げる
    for (let i = tossCount; i < 6; i++) {
      const { coins, total } = Chusekiho.tossThree();
      values.push(total);
      tossCount++;
      // 最後の1回だけアニメ表示
      if (i === 5) {
        setCoins(coins);
        showYaoResult(total);
      }
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
    if (!checkData()) return;
    initTestArea();
    initHistoryArea();
    btnToss.addEventListener("click", tossOne);
    btnSkip.addEventListener("click", tossAll);
    btnReset.addEventListener("click", reset);
    if (btnAi) btnAi.addEventListener("click", onAiClick);
    if (fortuneText) {
      fortuneText.addEventListener("input", updateCount);
      updateCount();
    }
  });

})();