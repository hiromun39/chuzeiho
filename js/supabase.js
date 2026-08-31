/* =========================================
   Supabase 連携
   - ユーザー認証（Googleログイン）
   - 履歴のDB保存・同期
   - メモリキャッシュ方式
   ========================================= */

(function () {
  "use strict";

  const SUPABASE_URL = "https://rkkklcxgcfdbpacxaeem.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_6onpolZblH_fJU8sxvCZ7w_0EGSgKpY";

  // Supabase クライアント
  let supabase = null;
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // 認証状態
  let currentUser = null;

  const AppSupabase = {
    get client() { return supabase; },
    get user() { return currentUser; },

    // ログイン状態監視
    init(callback) {
      if (!supabase) {
        if (callback) callback(null);
        return;
      }
      supabase.auth.getSession().then(({ data }) => {
        currentUser = data.session?.user || null;
        if (callback) callback(currentUser);
      });
      supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        if (callback) callback(currentUser);
      });
    },

    // Google ログイン
    async signInWithGoogle() {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) console.error("Googleログインエラー:", error.message);
      return data;
    },

    // ログアウト
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut();
    },

    // ---------- 履歴DB操作 ----------

    // DBから全履歴を取得し、localStorage に反映
    async fetchHistoryFromDB() {
      if (!supabase || !currentUser) return null;
      try {
        const { data, error } = await supabase
          .from("history")
          .select("*")
          .order("ts", { ascending: true });
        if (error) {
          console.error("履歴取得エラー:", error.message);
          return null;
        }
        // DBの形式をアプリ形式に変換して localStorage に反映
        const records = (data || []).map(rowToRecord);
        try {
          localStorage.setItem("eki-sen-history", JSON.stringify(records));
        } catch (e) {}
        console.log(`DB → localStorage 反映完了: ${records.length}件`);
        return records;
      } catch (e) {
        console.error("DB履歴取得エラー:", e);
        return null;
      }
    },

    // 履歴をDBに保存
    async saveHistory(record) {
      if (!supabase || !currentUser) return false;
      const { error } = await supabase
        .from("history")
        .insert([recordToRow(record)]);
      if (error) {
        console.error("履歴保存エラー:", error.message);
        return false;
      }
      return true;
    },

    // 履歴をDBで更新（AI解釈追記など）
    async updateHistory(ts, patch) {
      if (!supabase || !currentUser) return false;
      const updates = {};
      if (patch.aiText !== undefined) updates.ai_text = patch.aiText;
      if (patch.aiMode !== undefined) updates.ai_mode = patch.aiMode;
      if (Object.keys(updates).length === 0) return false;
      const { error } = await supabase
        .from("history")
        .update(updates)
        .eq("ts", ts);
      if (error) {
        console.error("履歴更新エラー:", error.message);
        return false;
      }
      return true;
    },

    // localStorage の履歴をDBへ同期（初回ログイン時）
    async syncLocalToDB() {
      if (!supabase || !currentUser) return;
      try {
        // DBから最新の履歴を取得（重複判断のため）
        const { data } = await supabase
          .from("history")
          .select("ts")
          .order("ts", { ascending: true });
        const existingTs = new Set((data || []).map(r => r.ts));

        const localHistory = JSON.parse(localStorage.getItem("eki-sen-history") || "[]");
        const toUpload = localHistory.filter(h => !existingTs.has(h.ts));

        for (const record of toUpload) {
          await AppSupabase.saveHistory(record);
        }
        console.log(`LocalStorage → DB 同期完了: ${toUpload.length}件`);
      } catch (e) {
        console.error("DB同期エラー:", e);
      }
    }
  };

  // 行→アプリ形式変換
  function rowToRecord(row) {
    return {
      ts: row.ts || new Date().toISOString(),
      fortune: row.fortune || "",
      honkaku: row.honkaku || null,
      shikaku: row.shikaku || null,
      henyo: row.henyo || [],
      kaji: row.kaji || "",
      aiText: row.ai_text || "",
      aiMode: row.ai_mode || "",
      metadata: row.metadata || {}
    };
  }

  // アプリ形式→行変換
  function recordToRow(record) {
    return {
      user_id: currentUser.id,
      ts: record.ts,
      fortune: record.fortune || null,
      honkaku: record.honkaku || null,
      shikaku: record.shikaku || null,
      henyo: record.henyo || [],
      kaji: record.kaji || null,
      ai_text: record.aiText || null,
      ai_mode: record.aiMode || null,
      metadata: record.metadata || {}
    };
  }

  // グローバル公開
  window.AppSupabase = AppSupabase;

})();