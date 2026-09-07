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

    // アクセストークン取得（Worker 呼び出し用）
    async getAccessToken() {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token || null;
    },

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

    // ---------- 課金API操作（Worker経由） ----------

    // プロキシURL（Worker）
    _workerBase() {
      return "https://eki-sen-ai-proxy.hiromun39.workers.dev";
    },

    // Worker へ JWT 付きで GET/POST する内部ヘルパー
    async _apiFetch(path, { method = "GET", body } = {}) {
      if (!supabase || !currentUser) {
        const err = new Error("ログインが必要です。");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        const err = new Error("ログインセッションを取得できませんでした。再ログインしてください。");
        err.code = "NOT_AUTHENTICATED";
        throw err;
      }
      const res = await fetch(this._workerBase() + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `エラー (${res.status})`);
        if (data.code) err.code = data.code;
        throw err;
      }
      return data;
    },

    // 現在のプラン状態を取得（/api/plans）
    async getPlans() {
      const data = await this._apiFetch("/api/plans", { method: "GET" });
      return data;
    },

    // チェックアウトURLを取得（plan: "single_500" | "monthly_2980"）
    // 成功時 { checkoutUrl } を返す
    async createCheckout(plan) {
      const path = plan === "single_500"
        ? "/api/checkout/single"
        : "/api/checkout/subscription";
      const data = await this._apiFetch(path, { method: "POST" });
      if (!data.checkoutUrl) {
        throw new Error("決済URLを取得できませんでした。");
      }
      return data.checkoutUrl;
    },

    // サブスク解約（/api/subscription/cancel）
    async cancelSubscription() {
      const data = await this._apiFetch("/api/subscription/cancel", { method: "POST" });
      return data; // { success, message }
    },

    // ---------- 履歴DB操作 ----------

    // DBから全履歴を取得し、localStorage の未同期データとマージして反映
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
        // DBの形式をアプリ形式に変換
        const dbRecords = (data || []).map(rowToRecord);

        // localStorage の既存履歴を取得
        let localRecords = [];
        try {
          localRecords = JSON.parse(localStorage.getItem("eki-sen-history") || "[]");
        } catch (e) {}

        // ts キーでマージ（DB優先・localStorage の未同期分も保持・ts は正規化）
        const dbMap = new Map();
        dbRecords.forEach(r => dbMap.set(r.ts, r));
        localRecords.forEach(r => {
          const normTs = normalizeTs(r.ts);
          r.ts = normTs;
          if (!dbMap.has(normTs)) dbMap.set(normTs, r);
        });
        const merged = [...dbMap.values()].sort((a, b) =>
          new Date(a.ts) - new Date(b.ts)
        );

        // マージ結果を localStorage に反映（未同期のローカルデータを保持）
        try {
          localStorage.setItem("eki-sen-history", JSON.stringify(merged));
        } catch (e) {}

        console.log(`DB → localStorage 反映完了: ${merged.length}件（DB:${dbRecords.length} / ローカル保持:${localRecords.length} / マージ後:${merged.length}）`);
        return merged;
      } catch (e) {
        console.error("DB履歴取得エラー:", e);
        return null;
      }
    },

    // 履歴をDBに保存（同じ ts が既に存在する場合はスキップ）
    async saveHistory(record) {
      if (!supabase || !currentUser) return false;
      try {
        const tsNormalized = normalizeTs(record.ts);
        // 重複チェック：同じ ts が既にDBにあるか確認
        const { data, error: checkError } = await supabase
          .from("history")
          .select("ts")
          .eq("ts", tsNormalized)
          .limit(1);
        if (checkError) {
          // チェック失敗時は insert を試みる（エラー時は後続で処理）
          console.error("重複チェックエラー:", checkError.message);
        } else if (data && data.length > 0) {
          // 既に存在する場合はスキップ
          console.log(`既存の履歴のためスキップ: ${tsNormalized}`);
          return true;
        }

        // ts を正規化して保存
        const { error } = await supabase
          .from("history")
          .insert([recordToRow(Object.assign({}, record, { ts: tsNormalized }))]);
        if (error) {
          // ユニーク制約違反など既に存在する場合は無視
          if (error.code === "23505") {
            console.log(`重複のためスキップ: ${tsNormalized}`);
            return true;
          }
          console.error("履歴保存エラー:", error.message);
          return false;
        }
        return true;
      } catch (e) {
        console.error("履歴保存エラー:", e);
        return false;
      }
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
        // DBから最新の履歴を取得（重複判断のため・ts を正規化）
        const { data } = await supabase
          .from("history")
          .select("ts")
          .order("ts", { ascending: true });
        const existingTs = new Set((data || []).map(r => normalizeTs(r.ts)));

        // ローカルの ts も正規化して比較
        const localHistory = JSON.parse(localStorage.getItem("eki-sen-history") || "[]");
        const toUpload = localHistory.filter(h => !existingTs.has(normalizeTs(h.ts)));

        for (const record of toUpload) {
          await AppSupabase.saveHistory(record);
        }
        console.log(`LocalStorage → DB 同期完了: ${toUpload.length}件`);
      } catch (e) {
        console.error("DB同期エラー:", e);
      }
    }
  };

  // タイムスタンプを標準形式（ISO 8601・UTC・ミリ秒）に正規化
  // - localStorage: "2026-08-09T08:41:45.365Z"  (文字列)
  // - Supabase DB:  "2026-08-09T08:41:45.365+00" (timestamp with time zone)
  // これらを比較・保存時に統一する
  function normalizeTs(ts) {
    if (!ts) return new Date().toISOString();
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? String(ts) : d.toISOString();
    } catch (e) {
      return String(ts);
    }
  }

  // 行→アプリ形式変換
  function rowToRecord(row) {
    return {
      ts: normalizeTs(row.ts),
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