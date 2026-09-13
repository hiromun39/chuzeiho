/* コラム一覧ページの描画ロジック（骨組み） */
(function () {
  "use strict";
  var CATEGORIES = (window.COLUMN_CATEGORIES || []);
  var ARTICLES = (window.COLUMNS || []);
  var activeCategory = "all";
  var activeTags = [];
  var tabsEl = document.getElementById("column-tabs");
  var tagsEl = document.getElementById("column-tags");
  var listEl = document.getElementById("column-list");
  if (!tabsEl || !tagsEl || !listEl) return;

  // HTML実体参照は、自動整形で崩れないよう文字コード連結で生成する
  var AMP = String.fromCharCode(38) + "amp;";
  var LT = String.fromCharCode(38) + "lt;";
  var GT = String.fromCharCode(38) + "gt;";
  var QUOT = String.fromCharCode(38) + "quot;";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, AMP)
      .replace(/</g, LT)
      .replace(/>/g, GT)
      .replace(/"/g, QUOT);
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  }

  function sortByDate(list) {
    return list.slice().sort(function (a, b) {
      var ta = new Date(a.published_at || 0).getTime() || 0;
      var tb = new Date(b.published_at || 0).getTime() || 0;
      return tb - ta;
    });
  }

  // 全記事からタグ一覧を収集（重複排除）
  function collectTags(list) {
    var seen = {};
    var tags = [];
    list.forEach(function (a) {
      (a.tags || []).forEach(function (t) {
        if (!seen[t]) { seen[t] = true; tags.push(t); }
      });
    });
    return tags;
  }

  // 絞り込み（カテゴリ＝完全一致、タグ＝いずれか1つでも一致）
  function filtered() {
    return sortByDate(ARTICLES).filter(function (a) {
      if (activeCategory !== "all" && a.category !== activeCategory) return false;
      if (activeTags.length > 0) {
        var has = (a.tags || []).some(function (t) { return activeTags.indexOf(t) >= 0; });
        if (!has) return false;
      }
      return true;
    });
  }

  // カテゴリタブ描画
  function renderTabs() {
    var items = [{ key: "all", label: "すべて" }].concat(
      CATEGORIES.map(function (c) { return { key: c, label: c }; })
    );
    tabsEl.innerHTML = items.map(function (it) {
      var cls = "column-tab" + (activeCategory === it.key ? " active" : "");
      return '<span class="' + cls + '" data-cat="' + escapeHtml(it.key) + '">' + escapeHtml(it.label) + "</span>";
    }).join("");

    [].forEach.call(tabsEl.querySelectorAll(".column-tab"), function (el) {
      el.addEventListener("click", function () {
        activeCategory = el.getAttribute("data-cat");
        renderTabs();
        renderList();
      });
    });
  }

  // タグチップ描画
  function renderTags() {
    var all = collectTags(ARTICLES);
    if (all.length === 0) { tagsEl.innerHTML = ""; return; }
    tagsEl.innerHTML = all.map(function (t) {
      var cls = "column-tag" + (activeTags.indexOf(t) >= 0 ? " active" : "");
      return '<span class="' + cls + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + "</span>";
    }).join("");

    [].forEach.call(tagsEl.querySelectorAll(".column-tag"), function (el) {
      el.addEventListener("click", function () {
        var t = el.getAttribute("data-tag");
        var i = activeTags.indexOf(t);
        if (i >= 0) activeTags.splice(i, 1); else activeTags.push(t);
        renderTags();
        renderList();
      });
    });
  }

  // 記事カード描画（0件時は空状態メッセージ）
  function renderList() {
    var items = filtered();

    if (items.length === 0) {
      listEl.innerHTML = '<div class="column-empty">'
        + "ただいま準備中です。<br>記事は近日公開予定です。"
        + "</div>";
      return;
    }

    listEl.innerHTML = items.map(function (a) {
      var tags = (a.tags || []).map(function (t) {
        return '<span class="column-tag">' + escapeHtml(t) + "</span>";
      }).join("");
      var cat = a.category ? '<span class="column-card-category">' + escapeHtml(a.category) + "</span>" : "";
      var date = a.published_at ? '<div class="column-card-meta">' + escapeHtml(formatDate(a.published_at)) + "</div>" : "";
      return '<a class="column-card" href="' + escapeHtml(a.slug) + '.html">'
        + cat
        + '<div class="column-card-title">' + escapeHtml(a.title) + "</div>"
        + '<div class="column-card-excerpt">' + escapeHtml(a.excerpt) + "</div>"
        + date
        + (tags ? '<div class="column-card-tags">' + tags + "</div>" : "")
        + "</a>";
    }).join("");
  }

  // 初期化
  renderTabs();
  renderTags();
  renderList();
})();
