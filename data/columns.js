/* =========================================
   コラム 記事データ（クライアント側定義）
   -----------------------------------------
   記事は「個別の静的HTML（/column/[slug].html）」として公開する方針。
   このファイルは記事データの「正」を持ち、一覧ページ（/column/index.html）
   の描画と、個別ページ生成の元データに使う。

   ■ 1記事あたりのフィールド
     - id                  : 一意なID
     - slug                : URL用の一意な文字列（/column/<slug>.html）
     - title               : 記事タイトル
     - excerpt             : 一覧カード用の抜粋（meta description にも使う）
     - body                : 本文（Markdown可）
     - category            : 大分類（下記の3種のいずれか1つ。複数選択不可）
     - tags                : タグ配列（自由入力・複数可。例：中筮法／歴史／DNA／体験談）
     - published_at        : 公開日（"YYYY-MM-DD" など）
     - related_hexagrams   : 本卦との紐付け用の配列（第n卦の数値）
                             現時点は空配列のまま。自動マッチング機能は未実装。
   ========================================= */

window.COLUMN_CATEGORIES = [
  "易学ノート",
  "運を味方につける",
  "開発秘話"
];

// 記事データ。現在は0件（記事投入時にここへ追加する）。
window.COLUMNS = [
  {
    id: 1,
    slug: "chuseiho-basics",
    title: "中筮法とは何か",
    excerpt: "中筮法の成り立ちと、易占の中での位置づけをやさしく解説します。",
    body: "（本文は column/chuseiho-basics.html に記載。このフィールドは一覧・生成用の控え）",
    category: "易学ノート",
    tags: ["中筮法", "歴史"],
    published_at: "2026-09-13",
    related_hexagrams: []
  }
];
