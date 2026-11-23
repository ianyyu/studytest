// Storage layer. Uses Supabase when assets/config.js is filled in,
// otherwise a DEMO backend kept in this browser's localStorage.
(function () {
  const cfg = window.QUIZ_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  // ── Supabase backend ────────────────────────────────────────────────
  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    async function fetchAll(table, order) {
      const rows = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        let q = sb.from(table).select("*").range(from, from + size - 1);
        for (const col of order) q = q.order(col, { ascending: true });
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...data);
        if (data.length < size) break;
      }
      return rows;
    }

    return {
      demo: false,
      async startQuiz() {
        const { data, error } = await sb.rpc("start_quiz", { p_user_agent: navigator.userAgent });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return { number: row.participant_number, token: row.participant_token };
      },
      async savePage(token, page, answers, pageSeconds) {
        const { error } = await sb.rpc("save_page", {
          p_token: token, p_page: page, p_answers: answers, p_page_seconds: pageSeconds,
        });
        if (error) throw error;
      },
      async finishQuiz(token) {
        const { error } = await sb.rpc("finish_quiz", { p_token: token });
        if (error) throw error;
      },
      async signIn(password) {
        const { error } = await sb.auth.signInWithPassword({ email: cfg.ADMIN_EMAIL, password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong password." : error.message);
      },
      async signOut() { await sb.auth.signOut(); },
      async isSignedIn() {
        const { data } = await sb.auth.getSession();
        return !!data.session;
      },
      async loadAll() {
        const [participants, responses, keyRows] = await Promise.all([
          fetchAll("participants", ["id"]),
          fetchAll("responses", ["participant_id", "page", "question"]),
          fetchAll("answer_key", ["page", "question"]),
        ]);
        if (!keyRows.length) {
          throw new Error("No answer key visible. Check that your email is in the admins table and answer_key.sql was run.");
        }
        const key = {};
        for (const r of keyRows) key[`${r.page}-${r.question}`] = r.correct;
        return { participants, responses, key };
      },
      async deleteParticipant(id) {
        const { error } = await sb.from("participants").delete().eq("id", id);
        if (error) throw error;
      },
    };
  }

  // ── Demo backend (localStorage) ─────────────────────────────────────
  function demoApi() {
    const DB = "studytest-demo-db";
    const read = () => {
      try { return JSON.parse(localStorage.getItem(DB)) || { participants: [], responses: [] }; }
      catch { return { participants: [], responses: [] }; }
    };
    const write = (db) => { try { localStorage.setItem(DB, JSON.stringify(db)); } catch {} };
    const nowIso = () => new Date().toISOString();

    return {
      demo: true,
      async startQuiz() {
        const db = read();
        const id = (db.participants.reduce((m, p) => Math.max(m, p.id), 0)) + 1;
        const token = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
        db.participants.push({ id, token, started_at: nowIso(), completed_at: null, last_page: 0, user_agent: navigator.userAgent });
        write(db);
        return { number: id, token };
      },
      async savePage(token, page, answers, pageSeconds) {
        const db = read();
        const p = db.participants.find((x) => x.token === token && !x.completed_at);
        if (!p) throw new Error("Session not found or already finished");
        for (const a of answers) {
          db.responses = db.responses.filter((r) => !(r.participant_id === p.id && r.page === page && r.question === a.question));
          db.responses.push({ participant_id: p.id, page, question: a.question, choice: a.choice,
            seconds_to_answer: a.seconds, page_seconds: pageSeconds, saved_at: nowIso() });
        }
        p.last_page = Math.max(p.last_page, page);
        write(db);
      },
      async finishQuiz(token) {
        const db = read();
        const p = db.participants.find((x) => x.token === token);
        if (p && !p.completed_at) p.completed_at = nowIso();
        write(db);
      },
      async signIn() { try { sessionStorage.setItem("studytest-demo-admin", "1"); } catch {} },
      async signOut() { try { sessionStorage.removeItem("studytest-demo-admin"); } catch {} },
      async isSignedIn() {
        try { return !!sessionStorage.getItem("studytest-demo-admin"); } catch { return false; }
      },
      async loadAll() {
        const db = read();
        const k = window.DEMO_ANSWER_KEY;
        if (!k) throw new Error("Demo mode needs private/answer-key.js (local only).");
        const key = {};
        for (const page in k) [...k[page]].forEach((c, i) => { key[`${page}-${i + 1}`] = c; });
        return { participants: db.participants, responses: db.responses, key };
      },
      async deleteParticipant(id) {
        const db = read();
        db.participants = db.participants.filter((p) => p.id !== id);
        db.responses = db.responses.filter((r) => r.participant_id !== id);
        write(db);
      },
    };
  }

  window.QuizApi = useSupabase ? supabaseApi() : demoApi();
})();
