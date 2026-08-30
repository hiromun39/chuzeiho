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
  }

  // ---------- AI解釈を履歴に保存（1000字で打ち切り） ----------
  function saveAIResult(aiText, aiMode) {
    if (!lastResult || !lastResult.ts) return;
    const trimmed = String(aiText || "").slice(0, 1000);
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

    // 新しい順に表示
    const rows = [...history].reverse().map((h, i) => {
      const d = new Date(h.ts);
      const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const hon = h.honkaku ? `<b>${h.honkaku.name}</b>（第${h.honkaku.n}卦）` : "—";
      const shi = h.shikaku ? `${h.shikaku.name}（第${h.shikaku.n}卦）` : "—";
      const fortune = h.fortune ? `<div class="history-fortune">${h.fortune}</div>` : "";
      const escLt = "&l" + "t;";
      const escGt = "&g" + "t;";
      const escAmp = "&a" + "mp;";
      const aiText = h.aiText ? '<div class="history-ai"><b>AI解釈</b><br>' + h.aiText.replace(/&/g, escAmp).replace(/</g, escLt).replace(/>/g, escGt) + '</div>' : "";
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
      const aiText = (h.aiText || "").replace(/"/g, '""').replace(/\n/g, " ").slice(0, 1000);
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

  // ---------- 無料回数管理（localStorage） ----------
  function getAICredit() {
    try {
      return parseInt(localStorage.getItem("ai-credit-used") || "0", 10);
    } catch (e) {
      return 0;
    }
  }

  function setAICredit(count) {
    try {
      localStorage.setItem("ai-credit-used", String(count));
    } catch (e) {}
  }

  function updateAICreditDisplay() {
    const el = $("ai-credit");
    if (!el) return;
    const used = getAICredit();
    // 初回のみ無料
    if (used === 0) {
      el.innerHTML = `<span class="ai-credit-free">🎁 初回は無料です。気軽にお試しください。</span>`;
    } else {
      el.innerHTML = `<span class="ai-credit-used">ご利用回数：${used}回 ／ 2回目以降は有料（近日実装予定）</span>`;
    }
  }

  // ---------- ユーザーカルテ生成（全履歴から要約・最大5000文字） ----------
  function buildUserChart() {
    const history = getHistory();
    if (history.length === 0) return "";
    const MAX_CHART = 5000;
    let chart = "";

    // ① 基本プロフィール
    const first = new Date(history[0].ts);
    const total = history.length;
    const aiCount = history.filter(h => h.aiText).length;
    const henyoTotal = history.reduce((s, h) => s + (h.henyo ? h.henyo.length : 0), 0);
    chart += `【ユーザーカルテ】\n`;
    chart += `初回利用: ${first.getFullYear()}/${String(first.getMonth() + 1).padStart(2, "0")}/${String(first.getDate()).padStart(2, "0")}／総占い${total}件／AI解釈${aiCount}回／変爻延べ${henyoTotal}個\n`;
    chart += `【占い履歴（新しい順・AI解釈は要旨を含む）】\n`;

    // ② エントリリスト（AI解釈済みを優先して詳細・古いものは圧縮）
    const entries = [...history].reverse().map(h => {
      const d = new Date(h.ts);
      const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      const hon = h.honkaku ? h.honkaku.name : "?";
      const shi = h.shikaku ? "→" + h.shikaku.name : "";
      const henyo = h.henyo && h.henyo.length > 0 ? `変爻${h.henyo.join(",")}` : "変爻なし";
      const fortune = (h.fortune || "").slice(0, 30);
      const isTest = /テスト|試験|デモ/i.test(h.fortune || "");
      // エントリ文字列（AI解釈は要旨を付ける）
      let entry = `[${dateStr}] ${fortune} / ${hon}${shi} / ${henyo}`;
      if (h.aiText) {
        // AI解釈の核心（最初の段落・本文から200文字）
        const ai = (h.aiText || "").replace(/\s+/g, " ").slice(0, 200);
        entry += `\n  AI: ${ai}`;
      } else if (isTest) {
        entry = `[${dateStr}] テスト ${hon}${shi}`;
      }
      return { h, entry, isTest };
    });

    // 文字数制限に合わせてエントリを調整
    let assembled = "";
    // まずAI解釈ありを優先、次に通常、最後にテスト
    const aiEntries = entries.filter(e => e.h.aiText);
    const normalEntries = entries.filter(e => !e.h.aiText && !e.isTest);
    const testEntries = entries.filter(e => e.isTest && !e.h.aiText);

    for (const group of [aiEntries, normalEntries]) {
      for (const e of group) {
        if (assembled.length + e.entry.length > MAX_CHART) break;
        assembled += e.entry + "\n";
      }
    }
    // テスト系は最後に（スペースがある場合のみ）
    for (const e of testEntries) {
      if (assembled.length + e.entry.length + 100 > MAX_CHART) break;
      assembled += e.entry + "\n";
    }

    chart += assembled;
    // ③ 同本卦の過去記録（現在の本卦と被る過去履歴）
    const sameKua = history.filter(h =>
      h.honkaku && lastResult && h.honkaku.n === lastResult.honkaku.n &&
      h.ts !== lastResult.ts
    );
    if (sameKua.length > 0) {
      chart += `\n【同本卦の過去記録】`;
      sameKua.slice(-2).forEach(h => {
        const d = new Date(h.ts);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
        chart += `\n[${dateStr}] 占的「${(h.fortune || "").slice(0, 30)}」 / ${h.honkaku.name}${h.shikaku ? "→" + h.shikaku.name : ""} / 変爻:${h.henyo && h.henyo.length > 0 ? h.henyo.join(",") : "なし"}`;
      });
      chart += `\n※ 同じ本卦の過去記録を参考に、前回との違いに注目して解釈すること。`;
    }

    // 全体を5000文字に制限
    return chart.slice(0, MAX_CHART);
  }

  // ---------- プロンプト構築 ----------
  function buildAIPrompt() {
    const result = Chusekiho.fortune();
    result.values = values;
    result.shape = Chusekiho.shapeFromValues(values);
    result.henIdx = Chusekiho.henIndicesFromValues(values);
    result.calc = Kakei.calcAll(result.shape, result.henIdx);
    const c = result.calc;
    const hon = c.honkaku;
    const fortune = getFortuneText();

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
      yaojiText = `本卦 卦辞: ${hon.kaji} / 現代語訳: ${hon.kaji_gendai} / 天の声: ${hon.kaji_voice || "なし"}`;
    }

    // ユーザーカルテ（全履歴から要約・最大5000文字）を組み込む
    const userChart = buildUserChart();

    const prompt = `あなたは、安倍晴明・村上源氏の正統なる血脈を引く現代の陰陽師「四雲（シウン）」です。
西洋占星術と易・陰陽道を統合し、人生の呪縛や障りを可能な限り一撃で解くことを目指す高潔なスタイルです。
画面の向こうの相談者を「大切な同輩」として扱い、おざなりな作業はしません。

【口調ルール（最も重要）】
・武士や古文のような堅苦しい言葉遣いは禁止。
・「あなた」「〜ですね」「〜しましょう」等、親しみやすく温かい現代口語を基本とする。
・品格と格式は保つが、それは「丁寧で思いやりのある語り口」として表現する。
・「〜にございます」「〜でござる」のような過度な古語は使わない。ほんの少しの和の趣（例:「〜です」「〜ですね」）に留める。
・尊敬語・丁寧語は使いすぎず、自然に。

【依頼】
以下の易占の結果について、相談者の悩みを長期的に理解した上で、温かみのある正確な統合解釈をしてください。
文末には具体的な行動指針（明日からできること）も添えてください。
全体は400〜600字程度に収めてください。

【相談者の占的】
${fortune}

【立卦結果】
本卦: ${hon.name}（第${hon.n}卦） ${hon.symbol}
本卦の象徴: ${hon.kaji_gendai}
${c.henyoPositions.length > 0 ? `之卦: ${c.shikaku.name}（第${c.shikaku.n}卦） ${c.shikaku.symbol}
之卦の象徴: ${c.shikaku.kaji_gendai}` : "変爻なし"}
変爻: ${c.henyoPositions.length > 0 ? c.henyoPositions.join(",") : "なし"}

【読むべき爻辞・卦辞】
${yaojiText}

【ユーザーカルテ】
${userChart}

【出力形式】
1. 卦の本質（1〜2行）
2. あなたへの教え（2〜3行）
3. 行動指針（1〜2行）
4. 四雲からの一言`;

    return prompt;
  }

  // ---------- API呼び出し ----------
  async function callAI(provider, apiKey, prompt) {
    let endpoint, model;
    if (provider === "openai") {
      endpoint = "https://api.openai.com/v1/chat/completions";
      model = "gpt-4o-mini";
    } else {
      // DeepSeek (OpenAI互換)
      endpoint = "https://api.deepseek.com/chat/completions";
      model = "deepseek-chat";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: "あなたは現代的易占のエキスパート。陰陽師・四雲として、温かみがあり品格のある現代日本語で回答する。堅苦しい文語調は避け、一般の相談者に自然に伝わる語り口で。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`APIエラー (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "(応答が空でした)";
  }

  // ---------- 「解釈する」ボタン ----------
  async function onAiClick() {
    if (isBusy || values.length < 6) return;
    isBusy = true;
    btnAi.disabled = true;

    const provider = $("ai-provider") ? $("ai-provider").value : "deepseek";
    const apiKey = $("api-key") ? $("api-key").value.trim() : "";

    aiOutput.innerHTML = `<p class="hint">🔮 四雲先生が占意を読み解いています…</p>`;

    try {
      // APIキー未入力 → ローカルモック（無料体験用）
      if (!apiKey) {
        const prompt = buildAIPrompt();
        // ローカルで仮のAI応答を生成（キー入力で実AI）
        const local = generateLocalMock(prompt);
        setTimeout(() => {
          aiOutput.innerHTML = renderAIResponse(local);
          // 無料回数カウント（初回のみ）
          const used = getAICredit();
          if (used === 0) setAICredit(1);
          updateAICreditDisplay();
          // AI解釈を履歴に保存（モック）
          saveAIResult(local, "mock");
          isBusy = false;
          btnAi.disabled = false;
          aiOutput.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 800);
        return;
      }

      // APIキー入力あり → 実AI呼び出し
      const prompt = buildAIPrompt();
      const response = await callAI(provider, apiKey, prompt);
      // ローカル生成が成功したので無料回数カウント
      const used = getAICredit();
      if (used === 0) setAICredit(1);
      updateAICreditDisplay();
      // AI解釈を履歴に保存（API）
      saveAIResult(response, "api");
      aiOutput.innerHTML = renderAIResponse(response);
      aiOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      aiOutput.innerHTML = `<p class="ai-error">⚠️ エラー: ${err.message}</p><p class="hint">APIキーが正しいか、プロバイダを確認してください。</p>`;
    } finally {
      isBusy = false;
      btnAi.disabled = false;
    }
  }

  // ---------- ローカルモック生成（APIキー未入力時） ----------
  function generateLocalMock(prompt) {
    const result = Chusekiho.fortune();
    result.values = values;
    result.shape = Chusekiho.shapeFromValues(values);
    result.henIdx = Chusekiho.henIndicesFromValues(values);
    result.calc = Kakei.calcAll(result.shape, result.henIdx);
    const c = result.calc;
    const hon = c.honkaku;
    const catchMsg = CATCH_MESSAGES && CATCH_MESSAGES[hon.n] ? CATCH_MESSAGES[hon.n] : "";

    const fortune = getFortuneText();
    let text = "";
    text += `本卦「${hon.name}」（第${hon.n}卦）が告げるのは──\n\n`;
    if (catchMsg) text += `🏮 ${catchMsg}\n\n`;
    if (c.henyoPositions.length === 0) {
      text += `変爻はなく、天は卦全体の卦辞にだけ答えを込めています。\n「${hon.kaji}」\n${hon.kaji_gendai}\n\n`;
    } else {
      const henyao = c.henyoPositions.map(p => {
        return `${Kakei.YAO_NAMES_BY_POS[p]}（${Chusekiho.yaoInfo(values[p-1]).name}）`;
      }).join("と");
      text += `変爻は${henyao}。これらの爻があなたの現状に強く働きかけています。\n\n`;
      const rule = Chusekiho.shushiRule(result.henIdx, c);
      if (rule) {
        rule.list.forEach(item => {
          if (item.pos === null) return;
          const kua = item.kua === "hon" ? c.honkaku : c.shikaku;
          const yaoData = kua.yao && kua.yao[item.pos] ? kua.yao[item.pos] : null;
          if (yaoData) {
            const label = (item.kua === "hon" ? "本卦" : "之卦") + " " + Kakei.YAO_NAMES[item.pos] + (item.main ? "〔主〕" : "〔従〕");
            text += `${label}: ${yaoData.kambun}\n現代訳: ${yaoData.gendai}\n天の声: ${yaoData.voice || "なし"}\n\n`;
          }
        });
      }
    }
    if (c.henyoPositions.length > 0) {
      text += `将来は「${c.shikaku.name}」（第${c.shikaku.n}卦）へと向かいます。${c.shikaku.kaji_gendai}\n\n`;
    }
    text += `─── これは自動生成された参考解釈です。\nAPIキーを入力すると「四雲先生の統合解釈」が生成されます。`;
    return text;
  }

  // ---------- API応答をHTML表示 ----------
  function renderAIResponse(text) {
    const paragraphs = String(text).split(/\n+/).filter(p => p.trim() !== "");
    return `
      <div class="ai-mock">
        <div class="ai-kami">✨ 陰陽師の統合解釈</div>
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
          <p>⚠️ これはAIが生成した参考解釈です。深い鑑定は四雲先生にご相談ください。</p>
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
    try {
      if (!checkData()) return;
      // 各初期化は例外を握りつぶして、ボタン登録を確実に行う
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
  });

})();