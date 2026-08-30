/* =========================================
   中筮法 ロジック
   硬貨3枚を投げる：表=3、裏=2
   6回繰り返して本卦を作る
   ========================================= */

const Chusekiho = (() => {

  // ---------- 硬貨1枚（表=3, 裏=2） ----------
  function tossCoin() {
    return Math.random() < 0.5 ? 2 : 3;
  }

  // ---------- 硬貨3枚を投げて合計値を得る ----------
  function tossThree() {
    const coins = [tossCoin(), tossCoin(), tossCoin()];
    const total = coins.reduce((a, b) => a + b, 0);
    return { coins, total };
  }

  // ---------- 爻値の説明 ----------
  const YAO_VALUES = {
    6: { name: "老陰", type: "陰", hen: true, sym: "⚋" },
    7: { name: "少陽", type: "陽", hen: false, sym: "⚊" },
    8: { name: "少陰", type: "陰", hen: false, sym: "⚋" },
    9: { name: "老陽", type: "陽", hen: true, sym: "⚊" }
  };

  // ---------- 爻値の説明を取得 ----------
  function yaoInfo(val) {
    return YAO_VALUES[val] || null;
  }

  // ---------- 爻値を卦形に（7,9=陽 / 6,8=陰） ----------
  function shapeFromValues(values) {
    return Kakei.yaoValsToShape(values);
  }

  // ---------- 変爻位置を取得 ----------
  function henIndicesFromValues(values) {
    return Kakei.henyoIndicesFromValues(values);
  }

  // ---------- 立卦：6回投げて結果を計算 ----------
  // 戻り値: { values, shape, henyo, result }
  function fortune() {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(tossThree());
    }

    const values = results.map(r => r.total);
    const allCoins = results.map(r => r.coins);
    const shape = shapeFromValues(values);
    const henIdx = henIndicesFromValues(values);
    const calc = Kakei.calcAll(shape, henIdx);

    return {
      values,               // 各爻の値 [初爻...上爻]
      allCoins,             // 各回のコイン結果
      shape,                // 本卦の卦形
      henIdx,               // 変爻位置（0-5）
      calc,                 // 全変卦計算結果
      yaoInfos: values.map(v => yaoInfo(v))
    };
  }

  // ---------- 朱子ルール：読むべき爻辞の判定 ----------
  // 戻り値: { rule, description, list }
  //   rule: 'kaji'|'ichiji'|'niji'|'sanji'|'yonji'|'goji'|'rokuji'
  //   description: ルールの説明文
  //   list: [{kua:'hon'|'shi', pos:0-5|null, main:bool}]
  function shushiRule(henIdx, calc) {
    const count = henIdx.length;

    // 変爻が0個：本卦の卦辞
    if (count === 0) {
      return {
        rule: "zero",
        description: "変爻なし。本卦の卦辞を読む。",
        list: []
      };
    }

    // 変爻が1個：本卦の変爻
    if (count === 1) {
      return {
        rule: "one",
        description: `変爻1個。本卦の${Kakei.YAO_NAMES[henIdx[0]]}の爻辞を用いる。`,
        list: [{ kua: "hon", pos: henIdx[0], main: true }]
      };
    }

    // 変爻が2個：本卦の2つの変爻。上の爻を主、下の爻を従
    if (count === 2) {
      const higher = Math.max(henIdx[0], henIdx[1]);  // 上
      const lower = Math.min(henIdx[0], henIdx[1]);   // 下
      return {
        rule: "two",
        description: `変爻2個。本卦の${Kakei.YAO_NAMES[higher]}（主）と${Kakei.YAO_NAMES[lower]}（従）の爻辞を用いる。`,
        list: [
          { kua: "hon", pos: higher, main: true },
          { kua: "hon", pos: lower, main: false }
        ]
      };
    }

    // 変爻が3個：本卦の卦辞と之卦の卦辞の両方を比較
    if (count === 3) {
      return {
        rule: "three",
        description: `変爻3個。本卦の卦辞と之卦の卦辞の両方を比較して占う（爻辞は読まない）。`,
        list: [
          { kua: "hon", pos: null, main: true },
          { kua: "shi", pos: null, main: false }
        ]
      };
    }

    // 変爻が4個：之卦の変化しなかった2爻（下を主）
    if (count === 4) {
      const unchanged = [];
      for (let i = 0; i < 6; i++) {
        if (!henIdx.includes(i)) unchanged.push(i);
      }
      const lower = Math.min(unchanged[0], unchanged[1]);
      const higher = Math.max(unchanged[0], unchanged[1]);
      return {
        rule: "four",
        description: `変爻4個。之卦の変化しなかった${Kakei.YAO_NAMES[lower]}（主）と${Kakei.YAO_NAMES[higher]}（従）の爻辞を用いる。`,
        list: [
          { kua: "shi", pos: lower, main: true },
          { kua: "shi", pos: higher, main: false }
        ]
      };
    }

    // 変爻が5個：之卦の変化しなかった1爻
    if (count === 5) {
      let unchangedIdx = -1;
      for (let i = 0; i < 6; i++) {
        if (!henIdx.includes(i)) { unchangedIdx = i; break; }
      }
      return {
        rule: "five",
        description: `変爻5個。之卦の変化しなかった${Kakei.YAO_NAMES[unchangedIdx]}の爻辞を用いる。`,
        list: [{ kua: "shi", pos: unchangedIdx, main: true }]
      };
    }

    // 変爻が6個：之卦の卦辞（乾は用九、坤は用六）
    if (count === 6) {
      const prefix = calc.honkaku.n === 1 ? "（乾）用九" : calc.honkaku.n === 2 ? "（坤）用六" : "";
      return {
        rule: "six",
        description: `変爻6個。之卦の卦辞を用いる${prefix ? "。ただし" + prefix + "を用いる" : ""}。`,
        list: [{ kua: "shi", pos: null, main: true }]
      };
    }

    return null;
  }

  return {
    tossCoin,
    tossThree,
    YAO_VALUES,
    yaoInfo,
    shapeFromValues,
    henIndicesFromValues,
    fortune,
    shushiRule
  };
})();