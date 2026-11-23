(function () {
  const api = window.QuizApi;
  const PAGES = window.QUIZ_PAGES;
  const TOTAL_Q = PAGES.reduce((n, p) => n + p.questions.length, 0);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let data = null; // { participants, responses, key }

  // ── Helpers ─────────────────────────────────────────────────────────
  const pct = (c, t) => (t ? (100 * c / t) : 0);
  const fmtPct = (c, t) => (t ? pct(c, t).toFixed(1) + "%" : "—");
  const heat = (c, t) => `hsl(${(pct(c, t) * 1.25).toFixed(1)} 48% 78%)`; // red → green, like summary.html
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const minutes = (p) => p.completed_at ? (new Date(p.completed_at) - new Date(p.started_at)) / 60000 : null;
  const fmtMin = (m) => m == null ? "—" : m < 1 ? `${Math.round(m * 60)}s` : `${m.toFixed(1)} min`;

  function cell(c, t) {
    if (!t) return `<span class="cell empty">—</span>`;
    return `<span class="cell" style="background:${heat(c, t)}">${c}/${t}<small>${fmtPct(c, t)}</small></span>`;
  }

  // Build a per-participant view: answers keyed "page-question" plus score.
  function buildRuns() {
    const byPid = new Map();
    for (const p of data.participants) byPid.set(p.id, { p, answers: {}, correct: 0, answered: 0 });
    for (const r of data.responses) {
      const run = byPid.get(r.participant_id);
      if (!run) continue;
      const k = `${r.page}-${r.question}`;
      const ok = data.key[k] === r.choice;
      run.answers[k] = { ...r, ok };
      run.answered += 1;
      if (ok) run.correct += 1;
    }
    return [...byPid.values()].sort((a, b) => b.p.id - a.p.id);
  }

  // ── Render ──────────────────────────────────────────────────────────
  function render() {
    const includePartial = $("include-partial").checked;
    const runs = buildRuns();
    const scored = runs.filter((r) => includePartial ? r.answered > 0 : !!r.p.completed_at);
    const completed = runs.filter((r) => r.p.completed_at);

    // Chips
    const totC = scored.reduce((n, r) => n + r.correct, 0);
    const totA = scored.reduce((n, r) => n + r.answered, 0);
    const meanScore = mean(completed.map((r) => r.correct));
    const meanDur = mean(completed.map((r) => minutes(r.p)));
    const last = runs[0] ? fmtDate(runs[0].p.started_at) : "—";
    $("chips").innerHTML = [
      `<div class="chip"><b>Overall ${totC}/${totA} (${fmtPct(totC, totA)})</b></div>`,
      `<div class="chip">Completed: ${completed.length} of ${runs.length} started</div>`,
      `<div class="chip">Mean score: ${meanScore == null ? "—" : meanScore.toFixed(1)} / ${TOTAL_Q}</div>`,
      `<div class="chip">Mean duration: ${fmtMin(meanDur)}</div>`,
      `<div class="chip">Latest start: ${last}</div>`,
    ].join("");

    // Question table
    let head = `<thead><tr><th class="label">Page</th>`;
    for (let q = 1; q <= 4; q++) head += `<th>Q${q}</th>`;
    head += `<th>Page total</th><th>Mean page time</th></tr></thead>`;
    let body = "<tbody>";
    let grandC = 0, grandT = 0;
    for (const page of PAGES) {
      let row = `<tr><td class="label">Page ${page.page}</td>`;
      let pc = 0, pt = 0;
      page.questions.forEach((item, qi) => {
        const k = `${page.page}-${qi + 1}`;
        let c = 0, t = 0;
        for (const r of scored) { const a = r.answers[k]; if (a) { t++; if (a.ok) c++; } }
        pc += c; pt += t;
        const title = `${item.q}\nCorrect: ${data.key[k] || "?"}) ${item.options[data.key[k]] || ""}`;
        row += `<td title="${esc(title)}">${cell(c, t)}</td>`;
      });
      grandC += pc; grandT += pt;
      const times = scored.map((r) => r.answers[`${page.page}-1`]?.page_seconds).filter((x) => x != null).map(Number);
      const mt = mean(times);
      row += `<td class="total">${cell(pc, pt)}</td><td>${mt == null ? "—" : mt.toFixed(1) + "s"}</td></tr>`;
      body += row;
    }
    body += `<tr class="total"><td class="label">All</td><td colspan="4"></td><td>${cell(grandC, grandT)}</td><td></td></tr></tbody>`;
    $("question-table").innerHTML = head + body;

    // Individual runs
    if (!runs.length) {
      $("runs").innerHTML = `<div class="empty-state">No one has taken the quiz yet. Share the quiz link, and results will show up here.</div>`;
      return;
    }
    $("runs").innerHTML = runs.map(runHtml).join("");
    for (const b of document.querySelectorAll("[data-delete]")) b.addEventListener("click", onDelete);
  }

  function runHtml(run) {
    const p = run.p;
    const status = p.completed_at
      ? `<span class="status done">Completed</span>`
      : `<span class="status partial">Unfinished · reached page ${Math.min(p.last_page + 1, PAGES.length)}</span>`;
    const score = `${run.correct}/${TOTAL_Q}`;
    const recovered = p.recovered
      ? ` <span class="status partial" title="This run was saved in the test taker's browser and uploaded when they reopened the quiz.">Recovered</span>`
      : "";
    let rows = "";
    for (const page of PAGES) {
      let pc = 0, pa = 0, pageSec = null;
      let cells = "";
      page.questions.forEach((_, qi) => {
        const a = run.answers[`${page.page}-${qi + 1}`];
        if (!a) { cells += `<td><span class="ans none">—</span></td>`; return; }
        pa++; if (a.ok) pc++;
        pageSec = a.page_seconds;
        const sec = a.seconds_to_answer != null ? `${Number(a.seconds_to_answer).toFixed(1)}s` : "";
        cells += `<td><span class="ans ${a.ok ? "ok" : "no"}" title="Correct: ${esc(data.key[`${page.page}-${qi + 1}`])}">${a.ok ? "✓" : "✗"} ${esc(a.choice)}<small>${sec}</small></span></td>`;
      });
      rows += `<tr><td class="label">Page ${page.page}</td>${cells}<td class="total">${pa ? `${pc}/${pa}` : "—"}</td><td>${pageSec != null ? Number(pageSec).toFixed(1) + "s" : "—"}</td></tr>`;
    }
    return `
      <details class="run">
        <summary>Participant #${p.id} · ${score} <span class="meta">${p.completed_at ? `${fmtPct(run.correct, TOTAL_Q)} · ${fmtMin(minutes(p))} · ` : ""}started ${fmtDate(p.started_at)}</span> ${status}${recovered}</summary>
        <div class="scroll"><table>
          <thead><tr><th class="label">Page</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Page score</th><th>Page time</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="run-foot">
          <span>Started ${fmtDate(p.started_at)} · Finished ${fmtDate(p.completed_at)}</span>
          <button class="btn small danger" data-delete="${p.id}" type="button">Delete this record</button>
        </div>
      </details>`;
  }

  async function onDelete(ev) {
    const id = Number(ev.currentTarget.dataset.delete);
    if (!confirm(`Permanently delete participant #${id} and all their answers? This can't be undone.`)) return;
    try { await api.deleteParticipant(id); await load(); }
    catch (e) { showLoadError(e); }
  }

  // ── CSV ─────────────────────────────────────────────────────────────
  function downloadCsv() {
    const runs = buildRuns().sort((a, b) => a.p.id - b.p.id);
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["participant", "started_at", "completed_at", "duration_min", "score", "page", "question", "question_text", "choice", "correct_answer", "is_correct", "seconds_to_answer", "page_seconds"].join(",")];
    for (const r of runs) {
      const dur = minutes(r.p);
      for (const page of PAGES) {
        page.questions.forEach((item, qi) => {
          const k = `${page.page}-${qi + 1}`;
          const a = r.answers[k];
          lines.push([r.p.id, r.p.started_at, r.p.completed_at || "", dur == null ? "" : dur.toFixed(2), r.correct,
            page.page, qi + 1, q(item.q), a ? a.choice : "", data.key[k] || "", a ? (a.ok ? 1 : 0) : "",
            a?.seconds_to_answer ?? "", a?.page_seconds ?? ""].join(","));
        });
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quiz-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── Auth + load ─────────────────────────────────────────────────────
  function showLoadError(e) {
    console.error(e);
    $("load-error").textContent = "Couldn't load results: " + (e.message || e);
    $("load-error").classList.remove("hidden");
  }

  async function load() {
    $("load-error").classList.add("hidden");
    $("refresh-btn").disabled = true;
    try { data = await api.loadAll(); render(); }
    catch (e) { showLoadError(e); }
    finally { $("refresh-btn").disabled = false; }
  }

  async function showDashboard() {
    $("login-view").classList.add("hidden");
    $("dash-view").classList.remove("hidden");
    $("signed-in-as").textContent = "Signed in as admin";
    await load();
  }

  function showLogin() {
    $("dash-view").classList.add("hidden");
    $("login-view").classList.remove("hidden");
  }

  $("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("login-error").classList.add("hidden");
    $("login-btn").disabled = true;
    try {
      await api.signIn($("password").value);
      $("password").value = "";
      await showDashboard();
    } catch (e) {
      $("login-error").textContent = e.message || "Sign in failed.";
      $("login-error").classList.remove("hidden");
    } finally { $("login-btn").disabled = false; }
  });
  $("logout-btn").addEventListener("click", async () => { await api.signOut(); showLogin(); });
  $("refresh-btn").addEventListener("click", load);
  $("csv-btn").addEventListener("click", () => data && downloadCsv());
  $("include-partial").addEventListener("change", () => data && render());

  if (api.demo) $("demo-banner").classList.remove("hidden");
  api.isSignedIn().then((yes) => (yes ? showDashboard() : showLogin()));
})();
