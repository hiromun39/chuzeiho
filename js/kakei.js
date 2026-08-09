/* =========================================
   卦計算ロジック
   本卦・之卦・賓卦（綜卦）・裏卦（錯卦）・互卦 の計算
   ・卦形はすべて「初爻→上爻」の順（6桁: 0=陰, 1=陽）
   ========================================= */

const Kakei = (() => {

  // ---------- 八卦マップ（卦形3桁 下→上 → 卦名・記号） ----------
  const HAKKA = {
    "111": { name: "乾", symbol: "☰" },
    "110": { name: "兌", symbol: "☱" },
    "101": { name: "離", symbol: "☲" },
    "100": { name: "震", symbol: "☳" },
    "011": { name: "巽", symbol: "☴" },
    "010": { name: "坎", symbol: "☵" },
    "001": { name: "艮", symbol: "☶" },
    "000": { name: "坤", symbol: "☷" }
  };

  // ---------- 爻名 ----------
  const YAO_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
  // 番号（1〜6）に対応する爻名（変爻表示用）
  const YAO_NAMES_BY_POS = {
    1: "初爻", 2: "二爻", 3: "三爻", 4: "四爻", 5: "五爻", 6: "上爻"
  };

  // ---------- 卦形から卦を検索 ----------
  function findKua(shapeStr) {
    if (!shapeStr || shapeStr.length !== 6) return null;
    for (const k of R64.kua) {
      if (k.shape === shapeStr) return k;
    }
    return null;
  }

  // ---------- 八卦の2分割から卦を確定 ----------
  function kuaFromHakka(lower3, upper3) {
    const shape = lower3 + upper3;
    return findKua(shape);
  }

  // ---------- 八卦表示 ----------
  function getHakka(shape3) {
    return HAKKA[shape3] || { name: "？", symbol: "?" };
  }

  // ---------- 本卦から全変卦を計算 ----------
  // honkakuShape: 6桁文字列（例 "111011"）
  // henIndices: 変爻位置（0〜5、初爻が0）
  function calcAll(honkakuShape, henIndices) {
    const h = honkakuShape.split("").map(Number);

    // ---- 之卦：変爻を一斉反転 ----
    const s = h.slice();
    for (const i of henIndices) {
      s[i] = s[i] === 1 ? 0 : 1;
    }
    const shikakuShape = s.join("");

    // ---- 賓卦（綜卦）：上下180度反転 ----
    const b = [h[5], h[4], h[3], h[2], h[1], h[0]];
    const hinkakuShape = b.join("");

    // ---- 裏卦（錯卦）：全爻反転 ----
    const r = h.map(x => (x === 1 ? 0 : 1));
    const rikakuShape = r.join("");

    // ---- 互卦：2〜4爻（下互）、3〜5爻（上互）----
    const lower = [h[1], h[2], h[3]].join(""); // 2,3,4爻
    const upper = [h[2], h[3], h[4]].join(""); // 3,4,5爻
    const gokoShape = lower + upper;

    const henyoPositions = henIndices.map(i => i + 1); // 1〜6

    return {
      honkaku: findKua(honkakuShape),
      shikaku: findKua(shikakuShape),
      hinkaku: findKua(hinkakuShape),
      rikaku: findKua(rikakuShape),
      goko: findKua(gokoShape),
      shikakuShape,
      hinkakuShape,
      rikakuShape,
      gokoShape,
      henyoPositions,
      henIndices,
      yaoNames: YAO_NAMES
    };
  }

  // ---------- 爻値を卦形へ（老陽/少陽→1、老陰/少陰→0） ----------
  function yaoValsToShape(values) {
    return values.map(v => (v === 7 || v === 9 ? 1 : 0)).join("");
  }

  // ---------- 爻値を変爻位置へ ----------
  function henyoIndicesFromValues(values) {
    return values.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter(i => i !== -1);
  }

  // ---------- 爻の表示名（九〇/六〇） ----------
  function yaoDisplayName(kua, pos) {
    // pos: 0〜5 (初爻→上爻)
    // 卦形は「初爻→上爻」の順なので shape[pos]
    const shape = kua ? kua.shape[pos] : "0";
    const yang = shape === "1";
    const num = ["初", "二", "三", "四", "五", "上"][pos];
    if (pos === 0) {
      return yang ? "初九" : "初六";
    }
    return (yang ? "九" : "六") + num;
  }

  return {
    HAKKA,
    YAO_NAMES,
    YAO_NAMES_BY_POS,
    findKua,
    kuaFromHakka,
    getHakka,
    calcAll,
    yaoValsToShape,
    henyoIndicesFromValues,
    yaoDisplayName
  };
})();