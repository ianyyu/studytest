(function () {
  const api = window.QuizApi;
  const PAGES = window.QUIZ_PAGES;
  const STATE_KEY = "studytest-session";
  const $ = (id) => document.getElementById(id);

  // state: { number, token, pageIndex, finished, answers: { [page]: { [q]: {choice, seconds} } } }
  let state = loadState();
  let pageOpenedAt = 0;
  let saving = false;

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || null; } catch { return null; }
  }
  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
  }
  function clearState() {
    state = null;
    try { localStorage.removeItem(STATE_KEY); } catch {}
  }

  function show(screen) {
    for (const id of ["screen-intro", "screen-quiz", "screen-done"]) $(id).classList.toggle("hidden", id !== screen);
    window.scrollTo({ top: 0 });
  }

  function setProgress(done, label) {
    const pct = Math.round((done / PAGES.length) * 100);
    $("progress-fill").style.width = pct + "%";
    document.querySelector(".progress").setAttribute("aria-valuenow", String(done));
    $("progress-label").innerHTML = label;
    $("participant-label").innerHTML = state ? `Participant <b>#${state.number}</b>` : "";
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function renderPage() {
    const idx = state.pageIndex;
    const page = PAGES[idx];
    const saved = (state.answers[page.page] || {});
    $("page-title").textContent = `Page ${page.page} of ${PAGES.length}`;
    setProgress(idx, `Page <b>${page.page}</b> of ${PAGES.length}`);

    const box = $("questions");
    box.innerHTML = "";
    page.questions.forEach((item, qi) => {
      const qNum = qi + 1;
      const fs = document.createElement("fieldset");
      fs.className = "question";
      const legend = document.createElement("legend");
      legend.innerHTML = `<span class="num">${qNum}.</span>`;
      legend.append(document.createTextNode(item.q));
      fs.append(legend);
      for (const [letter, text] of Object.entries(item.options)) {
        const label = document.createElement("label");
        label.className = "option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `q${qNum}`;
        input.value = letter;
        if (saved[qNum] && saved[qNum].choice === letter) input.checked = true;
        input.addEventListener("change", () => onPick(page.page, qNum, letter));
        const l = document.createElement("span"); l.className = "letter"; l.textContent = letter;
        const t = document.createElement("span"); t.className = "text"; t.textContent = text;
        label.append(input, l, t);
        fs.append(label);
      }
      box.append(fs);
    });

    $("next-btn").textContent = idx === PAGES.length - 1 ? "Submit" : "Next";
    $("save-error").classList.add("hidden");
    pageOpenedAt = performance.now();
    updateNext();
    show("screen-quiz");
  }

  function onPick(page, q, letter) {
    const seconds = Math.round((performance.now() - pageOpenedAt) / 100) / 10;
    state.answers[page] = state.answers[page] || {};
    state.answers[page][q] = { choice: letter, seconds };
    saveState();
    updateNext();
  }

  function updateNext() {
    const page = PAGES[state.pageIndex];
    const n = Object.keys(state.answers[page.page] || {}).length;
    const total = page.questions.length;
    $("answered-hint").textContent = n < total ? `${n} of ${total} answered` : "All answered";
    $("next-btn").disabled = n < total || saving;
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function start() {
    const btn = $("start-btn");
    btn.disabled = true;
    btn.textContent = "Starting…";
    $("start-error").classList.add("hidden");
    try {
      const { number, token } = await api.startQuiz();
      state = { number, token, pageIndex: 0, finished: false, answers: {} };
      saveState();
      renderPage();
    } catch (e) {
      console.error(e);
      $("start-error").textContent = "Couldn't start the quiz. Check your connection and try again.";
      $("start-error").classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Start";
    }
  }

  async function next(ev) {
    ev.preventDefault();
    if (saving) return;
    const page = PAGES[state.pageIndex];
    const picked = state.answers[page.page] || {};
    if (Object.keys(picked).length < page.questions.length) return;

    saving = true;
    updateNext();
    $("next-btn").textContent = "Saving…";
    $("save-error").classList.add("hidden");
    try {
      const answers = Object.entries(picked).map(([q, a]) => ({ question: Number(q), choice: a.choice, seconds: a.seconds }));
      const pageSeconds = Math.round((performance.now() - pageOpenedAt) / 100) / 10;
      await api.savePage(state.token, page.page, answers, pageSeconds);
      const isLast = state.pageIndex === PAGES.length - 1;
      if (isLast) {
        await api.finishQuiz(state.token);
        state.finished = true;
        saveState();
        saving = false;
        renderDone();
      } else {
        state.pageIndex += 1;
        saveState();
        saving = false;
        renderPage();
      }
    } catch (e) {
      console.error(e);
      saving = false;
      $("save-error").textContent = "Couldn't save your answers. Check your connection and click the button again.";
      $("save-error").classList.remove("hidden");
      $("next-btn").textContent = state.pageIndex === PAGES.length - 1 ? "Submit" : "Next";
      updateNext();
    }
  }

  function renderDone() {
    setProgress(PAGES.length, "<b>Complete</b>");
    $("done-number").textContent = "#" + state.number;
    show("screen-done");
  }

  function renderIntro() {
    setProgress(0, "Instructions");
    show("screen-intro");
  }

  // ── Boot ────────────────────────────────────────────────────────────
  if (api.demo) $("demo-banner").classList.remove("hidden");
  $("start-btn").addEventListener("click", start);
  $("quiz-form").addEventListener("submit", next);
  $("reset-btn").addEventListener("click", () => { clearState(); renderIntro(); });

  if (!state) renderIntro();
  else if (state.finished) renderDone();
  else renderPage();
})();
