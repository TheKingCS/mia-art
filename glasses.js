/* MIA on Display glasses (DEC-0016; Muse's composition H-0041/H-0043;
   Zac's layout, 2026-10-16; pins DEC-0024).

   One fixed 600x600 composition scaled to the screen: nothing is cut off,
   and only the conversation log (Ambient presence, the card just before
   the orb) scrolls. Two moves do everything:
     move   (swipe, ← → ↑ ↓, the Neural Band's scroll)  next / previous
     select (tap, Enter, the Band's pinch)              do what's selected
   Every list ends with a Back row, so those two are enough; Esc or a
   swipe down is a shortcut for back.

   Home is her orb alone. Select it and she listens (rings like
   Saturn's); her answer shows under her for a moment, then she's alone
   again. Talking through the glasses themselves goes through the phone
   (core/glasses_voice.py): the phone hears you and speaks her answer, and
   this screen opens the app you named or shows the answer (the feed).

   From the orb, move to your pinned apps (your favorites), then "All
   apps". Select an app for its quick actions (core/glasses.py). A change
   shows MIA's sentence and needs a second select (two-gesture approve).
   Every word on a screen comes from the engine, or says it's the demo. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const home = $("home"), screen = $("screen"), caption = $("caption");
  const demo = MIA.demo;
  $("demo-tag").hidden = !demo;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // ------------------------------------------------------------ fit the 600x600 stage to the screen
  function fit() {
    const v = window.visualViewport;
    const w = v ? v.width * v.scale : innerWidth, h = v ? v.height * v.scale : innerHeight;
    document.documentElement.style.setProperty("--fit", String(Math.min(w, h) / 600));
  }
  addEventListener("resize", fit);
  if (window.visualViewport) visualViewport.addEventListener("resize", fit);
  fit();

  // ------------------------------------------------------------ state
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: just don't remember */ } },
  };
  let data = null;           // MIA.glasses(): {apps, others, pinned, hint}
  let view = "home";         // home | cards | menu | panel | confirm | result | reward | hud | log | boot | sync | welcome
  let showingAll = false;    // browsing the apps that aren't pinned
  let appIndex = 0, row = 0;
  let panel = null, proposal = null, resultText = "", after = "menu", busy = false, crumbs = [], panelItem = "";
  const LIVE_MS = 2000;  // a live panel (the workout going now) keeps itself current
  let reward = null, rewardTimer = null;
  let mission = store.get("mia.glasses.mission") || "";

  async function load() {
    try { data = await MIA.glasses(mission); } catch (e) { data = data || { apps: [], others: [] }; }
    if (!data || !Array.isArray(data.apps)) data = { apps: [], others: [] };
    if (window.MIASound && !load.sound) {  // the person's sound settings, once
      load.sound = true;
      MIA.shell().then((s) => { MIASound.configure(s.sound); if (window.MIAPlaces) MIAPlaces.configure(s.places); }).catch(() => {});
    }
  }

  const ALL = { id: "__all", name: "All Apps" };
  const BACK_CARD = { id: "__back", name: "Back", status: "To your pinned apps" };
  const LOG_CARD = { id: "__log", name: "Conversation", status: "Everything you and MIA have said" };
  const WELCOME_CARD = { id: "__welcome", name: "Know Your System", status: "Your first mission and the tours" };
  const SYNC_CARD = { id: "__sync", name: "Getting To Know You", status: "Pick up where we left off" };
  function cards() {
    const d = data || {};
    if (showingAll) return (d.others || []).concat([BACK_CARD]);
    const list = (syncLeft ? [SYNC_CARD] : welcomeLeft ? [WELCOME_CARD] : []).concat(d.apps || []);
    // The log comes last: one move back from the orb reaches it.
    return (d.pinned && (d.others || []).length
      ? list.concat([Object.assign({}, ALL, { status: d.others.length + " more apps" })]) : list).concat([LOG_CARD]);
  }
  function app() { return cards()[appIndex] || null; }

  // ------------------------------------------------------------ home: her orb
  let voiceState = "idle", recorder = null, chunks = [], captionTimer = null;
  // Listening, thinking, speaking, interrupted, unavailable: the same states
  // as the Presence System (docs/GLASSES_FIRST_BOOT_PLAN.md, slice 1).
  const STATE_NAMES = { listening: "Listening", thinking: "Thinking", interrupted: "Stopped", unavailable: "Offline" };
  let speaking = false;
  function paintOrb() {
    home.className = [voiceState === "idle" ? "" : voiceState, speaking ? "speaking" : ""].join(" ").trim();
    const tag = document.querySelector(".log-state");
    if (tag) {
      tag.textContent = "MIA · " + (speaking ? "Speaking" : STATE_NAMES[voiceState] || "Ready");
      tag.previousElementSibling.className = "log-orb " + home.className;
    }
  }
  function orbState(state) {
    voiceState = state;
    paintOrb();
  }
  function answer(text, seconds) {
    clearTimeout(captionTimer);
    caption.textContent = text;
    orbState("answered");
    captionTimer = setTimeout(() => { if (voiceState === "answered") orbState("idle"); }, (seconds || 7) * 1000);
  }
  function wav(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buffer);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data");
    v.setUint32(40, samples.length * 2, true);
    samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
    return new Blob([buffer], { type: "audio/wav" });
  }
  async function toWav(blob) {
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = audio; source.connect(offline.destination); source.start();
    return wav((await offline.startRendering()).getChannelData(0), rate);
  }
  // Start listening (select on the orb, or "Hey MIA" from the companion later); select again to stop.
  async function listen() {
    if (view !== "home" && view !== "log") show("home");
    if (voiceState === "listening") { if (recorder && recorder.state === "recording") recorder.stop(); return; }
    if (voiceState === "thinking") return;
    clearTimeout(captionTimer);
    if (MIA.phoneListen) {  // the public page (DEC-0062): the phone hears, the orb follows it
      orbState("listening");
      try { await MIA.phoneListen(); } catch (err) { answer(err.message); }
      return;
    }
    if (demo) {
      orbState("listening");
      demoTimer = setTimeout(() => {
        orbState("thinking");
        demoTimer = setTimeout(() => answer("This is the demo: talking to her needs MIA running."), 900);
      }, 2600);
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) { answer("This screen can't use a microphone. \"Hey MIA\" comes with the phone companion."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { answer("MIA needs permission to use the microphone."); return; }
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    cancelled = false;
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled) { cancelled = false; return; }
      orbState("thinking");
      try {
        const turn = await MIA.voice(await toWav(new Blob(chunks)));
        if (turn.audio_wav_base64) {
          const audio = new Audio("data:audio/wav;base64," + turn.audio_wav_base64);
          audio.play().catch(() => {});
        }
        answer(turn.reply_text || "Done.", 9);
        load();
        if (view === "log") openLog();
      } catch (err) { answer(err.message); }
    };
    recorder.start();
    orbState("listening");
    setTimeout(() => { if (recorder && recorder.state === "recording") recorder.stop(); }, 8000);
  }
  // Move away while she listens: stop without sending anything.
  let cancelled = false, demoTimer = null;
  function stopListening() {
    clearTimeout(demoTimer); clearTimeout(captionTimer);
    if (recorder && recorder.state === "recording") { cancelled = true; recorder.stop(); }
    orbState("idle");
  }

  // The phone's listening service says what she's doing (core/glasses_feed.py);
  // her orb follows it. No answer from MIA at all: the quiet offline orb.
  const ORB_POLL_MS = 1200, OFFLINE_AFTER = 3, OFFLINE_SAY = "I can't reach your system right now. I'll be back as soon as I can.";
  let phoneState = "idle", orbMisses = 0;
  function followPhone(state) {
    if (state === phoneState) return;
    const was = phoneState;
    phoneState = state;
    speaking = state === "speaking";
    if (recorder && recorder.state === "recording") return;  // this screen's own microphone turn
    if (view === "boot") return;
    if (state === "listening" && view === "hud") show("home");
    if (state === "listening" || state === "thinking" || state === "interrupted") { clearTimeout(captionTimer); orbState(state); }
    else if (voiceState === "listening" || voiceState === "thinking" || voiceState === "interrupted") orbState("idle");
    else paintOrb();
    if (was === "thinking" || state === "idle") { hudFetch(); if (view === "log") openLog(); }  // her answer's card
  }
  async function orbPoll() {
    try {
      const got = await MIA.glassesOrb();
      orbMisses = 0;
      if (voiceState === "unavailable") { caption.textContent = ""; orbState("idle"); }
      followPhone(got.state || "idle");
    } catch (e) {
      if (e && e.status && e.status < 500) return;  // MIA answered: that's not offline
      if (++orbMisses >= OFFLINE_AFTER && voiceState !== "unavailable") {
        clearTimeout(captionTimer);
        caption.textContent = OFFLINE_SAY;
        speaking = false;
        orbState("unavailable");
      }
    }
  }
  setInterval(orbPoll, ORB_POLL_MS);
  window.MIAGlasses = { listen, followPhone, orbState };

  // ------------------------------------------------------------ screens
  function hint(selectWhat) {
    return el("p", "hint", "<b>◀ ▶</b> move &nbsp;·&nbsp; <b>●</b> " + esc(selectWhat));
  }
  function badge(a) {
    const icon = window.MIAIcons && MIAIcons.svg(a.id === "__all" ? "apps" : a.id === "__back" || a.id === "__log" ? "mia" : a.id);
    const b = el("div", "badge");
    if (icon) b.append(icon); else b.textContent = (a.name || "?").trim().charAt(0).toUpperCase();
    return b;
  }
  function kicker(left, right) {
    const k = el("p", "k");
    k.append(el("span", "", esc(left)));
    if (right) k.append(el("span", "pos", esc(right)));
    return k;
  }
  // A window of five rows around the selection: the selection moves it, nothing scrolls.
  function rowsOf(items, sel) {
    const n = items.length, start = Math.max(0, Math.min(sel - 2, n - 5));
    const ul = el("ul", "rows");
    items.slice(start, start + 5).forEach((it, k) => {
      const i = start + k;
      const li = el("li", [i === sel ? "sel" : "", it.back ? "back" : "", it.cap ? "cap" : "", it.tone ? "t-" + it.tone : ""].join(" ").trim());
      li.append(el("span", "t", esc(it.back ? "‹ " + it.text : it.text)));
      if (it.detail) li.append(el("span", "d", esc(it.detail)));
      if (it.verb) li.append(el("span", "v", esc(it.verb)));
      li.dataset.row = String(i);
      ul.append(li);
    });
    const more = el("p", "more", (start > 0 ? "▲ " + start + " above" : "") + (start > 0 && start + 5 < n ? " · " : "") +
      (start + 5 < n ? "▼ " + (n - start - 5) + " more" : ""));
    return [ul, more];
  }
  const BACK_ROW = { text: "Back", back: true, kind: "back" };

  // An app's own screens: the frame from the design (corners, where you are,
  // what move and select do), its numbers, and its rows.
  function appFrame(a, where, pos, children, doing) {
    const wrap = el("div", "sync app-screen");
    ["tl", "tr", "bl", "br"].forEach((k) => wrap.append(el("i", "rc " + k)));
    const top = el("div", "s-top");
    const who = el("span", "s-who");
    const icon = window.MIAIcons && MIAIcons.svg(a.id);
    if (icon) who.append(icon);
    who.append(el("span", "", esc(a.name)));
    top.append(who, el("span", "", esc(where || "") + (pos ? " · " + esc(pos) : "")));
    wrap.append(top, ...children, el("p", "s-hint", "<b>▶</b> move &nbsp;·&nbsp; <b>●</b> " + esc(doing) + " &nbsp;·&nbsp; <b>▼</b> back"));
    return wrap;
  }
  function appTiles(a) {
    const list = a.tiles || [];
    if (!list.length) return [];
    return [tiles(list.map((t) => ({ on: t.tone === "attention", html: "<b>" + esc(t.value) + "</b><small>" + esc(t.label) + "</small>" })))];
  }
  // Home and the app menu, from the boards: her orb and the time, what matters
  // now, and every app as a tile, eight to a page. Move walks the tiles.
  const TILES_A_PAGE = 8;
  function dashScreen(list, a) {
    const d = data || {};
    const wrap = el("div", "sync app-screen dash");
    ["tl", "tr", "bl", "br"].forEach((k) => wrap.append(el("i", "rc " + k)));
    const top = el("div", "s-top");
    const who = el("span", "s-who");
    who.append(el("i", "log-orb"), el("span", "", showingAll ? "All Apps" : "MIA"));
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    top.append(who, el("span", "d-time", esc(time)));
    wrap.append(top);
    if (!showingAll) {
      const now = el("div", "d-now");
      now.append(el("p", "s-label", "Priority now"), el("p", "d-line", esc(d.priority || "Nothing needs you right now.")));
      wrap.append(now);
    }
    const from = Math.floor(appIndex / TILES_A_PAGE) * TILES_A_PAGE;
    const grid = el("div", "w-tiles");
    list.slice(from, from + TILES_A_PAGE).forEach((c, i) => {
      const tile = el("div", "w-tile" + (from + i === appIndex ? " on" : ""));
      tile.append(badge(c), el("span", "", esc(c.name)));
      grid.append(tile);
    });
    const box = el("div", "w-card");
    box.append(el("div", "s-top", "<span>" + esc(a.name) + "</span><span>" + (appIndex + 1) + " of " + list.length + "</span>"));
    const line = a.status || a.tagline || "";
    if (line) box.append(el("p", "w-sum" + (a.tone === "attention" ? " attn" : ""), esc(line)));
    wrap.append(grid, box, el("p", "s-hint", "<b>▶</b> move &nbsp;·&nbsp; <b>●</b> open &nbsp;·&nbsp; <b>▼</b> her orb"));
    return wrap;
  }
  // A mission, from the Phase 6 board: its card, each objective ticked or not, the XP.
  function missionBoard(a, rows) {
    const m = a.mission;
    const box = el("div", "w-card m-board");
    if (!m) box.append(el("h1", "s-q", "No active mission"), el("p", "w-sum", "Start one on your phone or ask MIA."));
    else {
      box.append(el("p", "s-label", m.ready ? "Ready to claim" : "Mission"), el("h1", "s-q", esc(m.name)));
      const shown = m.objectives.slice(0, 4);
      shown.forEach((o) => {
        const row = el("div", "m-obj" + (o.done ? " on" : ""));
        row.append(el("i", "chk", o.done ? "✓" : ""), el("span", "", esc(o.text)));
        if (!o.done && o.target && o.target !== 1) row.append(el("em", "", esc(o.progress || 0) + "/" + esc(o.target)));
        box.append(row);
      });
      if (m.objectives.length > shown.length) box.append(el("p", "more", "+ " + (m.objectives.length - shown.length) + " more"));
      const pct = m.total ? Math.round(100 * m.done / m.total) : 0;
      const foot = el("div", "s-foot");
      foot.append(el("span", "", esc(m.done) + " of " + esc(m.total)), el("div", "m-bar", '<i style="width:' + pct + '%"></i>'));
      if (m.reward_xp) foot.append(el("span", "m-xp", "+" + esc(m.reward_xp) + " XP"));
      box.append(foot);
    }
    const chips = el("div", "s-chips");
    rows.forEach((r, i) => chips.append(el("div", "s-chip" + (i === row ? " sel" : ""), esc(r.back ? "Back" : r.text))));
    return [box, chips];
  }
  // Now Playing: the phone plays it (Music.kt), so it comes out of the glasses.
  // Select presses the chip; move picks one. The titles come from the list it was played from.
  const PLAYER_MS = 2000, PLAYER_CHIPS = [["pause", "Pause"], ["next", "Next"], ["previous", "Previous"]];
  let playing = null, songs = {}, playerRow = 0, afterPlayer = "menu";
  function rememberSongs() {
    (panel ? panel.lines : []).forEach((l) => { if (l.play) songs[l.play.ids[l.play.at]] = { title: l.text, detail: l.detail }; });
  }
  async function playFrom(play) {
    rememberSongs(); afterPlayer = "panel";
    try { playing = await MIA.musicPlay({ ids: play.ids, at: play.at }); playerRow = 0; show("player"); }
    catch (err) { resultText = err.message; after = "panel"; show("result"); }
  }
  async function openPlayer() {
    afterPlayer = "menu";
    try { playing = await MIA.musicNow(); } catch (err) { playing = null; }
    playerRow = 0; show("player");
  }
  async function playerPress() {
    const what = PLAYER_CHIPS[playerRow][0];
    const press = what === "pause" && playing && !playing.playing ? "resume" : what;
    try { playing = await MIA.musicControl({ do: press }); render(); }
    catch (err) { answer(err.message, 5); }
  }
  setInterval(() => {
    if (view === "player" && !demo) MIA.musicNow().then((now) => { playing = now; if (view === "player") render(); }).catch(() => {});
  }, PLAYER_MS);
  function playerScreen(a) {
    const p = playing || {}, song = songs[p.track] || {};
    const box = el("div", "w-card");
    if (!p.track) box.append(el("h1", "s-q", "Nothing playing"), el("p", "w-sum", "Pick a song, a playlist or an artist."));
    else {
      box.append(el("p", "s-label", p.playing ? "Now playing" : "Paused"), el("h1", "s-q", esc(song.title || "Song " + p.number)));
      if (song.detail) box.append(el("p", "w-sum", esc(song.detail)));
      const foot = el("div", "s-foot");
      foot.append(el("span", "", esc(p.number) + " of " + esc(p.total)), el("div", "m-bar", '<i style="width:' + (p.length ? Math.round(100 * p.seconds / p.length) : 0) + '%"></i>'));
      box.append(foot);
    }
    const chips = el("div", "s-chips");
    PLAYER_CHIPS.forEach(([what, label], i) => chips.append(el("div", "s-chip" + (i === playerRow ? " sel" : ""), esc(what === "pause" && !p.playing ? "Play" : label))));
    return appFrame(a, "Now Playing", "", p.track ? [box, chips] : [box], "press");
  }
  function menuRows(a) {
    return (a.menu || []).map((m) => ({ text: (m.type === "action" ? "★ " : "") + m.label, cap: true,
      verb: m.type === "ask" ? "ask" : m.type === "action" ? "" : "›" }))
      .concat([BACK_ROW]);
  }
  // Sorting a list by Past Due / Due Today / Due Soon (Zac, 2026-10-16):
  // its first row; select cycles the sort, the rows follow.
  let sortIndex = 0;
  function sorts() { return (panel && panel.filters) || null; }
  function panelRows() {
    if (!panel) return [BACK_ROW];
    const rows = [];
    const f = sorts();
    const want = f ? f[sortIndex % f.length].id : null;
    if (f) {
      const cur = f[sortIndex % f.length];
      rows.push({ kind: "sort", text: "Sort: " + cur.label + " (" + cur.count + ")", verb: "Sort", cap: true });
    }
    panel.lines.forEach((l) => {
      if (want && l.bucket !== want) return;
      rows.push({ kind: "line", line: l, text: l.text, detail: l.detail, tone: l.tone,
        verb: actionOf(l) ? actionOf(l).label : l.pick ? l.pick.label : l.open ? l.open.label : l.play ? l.play.label : l.recipe ? "Open" : "" });
    });
    return rows.concat([BACK_ROW]);
  }
  // Through the relay the phone offers a reference in place of the action (DEC-0064).
  function actionOf(line) { return line.action || line.offered || null; }
  function isCarousel() { return !!(panel && panel.lines.length && panel.lines[0].recipe); }

  // A recipe on the glasses: its picture first, then its ingredients
  // (six to a page) and its steps (one to a page). Move pages; select goes back.
  let recipe = null, page = 0;
  function recipePages(r) {
    const pages = [{ kind: "cover" }];
    for (let i = 0; i < r.ingredients.length; i += 6) pages.push({ kind: "ingredients", items: r.ingredients.slice(i, i + 6), at: i });
    r.steps.forEach((step, i) => pages.push({ kind: "step", text: step, n: i + 1 }));
    return pages;
  }
  function recipePhoto(r, cls) {
    const box = el("div", cls);
    const icon = window.MIAIcons && MIAIcons.svg("kitchen");
    if (icon) box.append(icon);
    if (r.photo) MIA.image(r.photo).then((url) => {
      if (url) { const img = el("img"); img.src = url; img.alt = ""; box.replaceChildren(img); }
    });
    return box;
  }

  function show(v) {
    if (view === "hud" && v !== "hud") hudStop();
    view = v;
    document.body.classList.toggle("hud-on", v === "hud");  // nothing on screen but the card
    home.hidden = v !== "home";
    screen.hidden = v === "home" || v === "boot";
    document.body.classList.toggle("sync-on", v === "sync");
    document.body.classList.toggle("reading", v !== "home" && v !== "boot");  // no glow behind words
    $("boot").hidden = v !== "boot";
    document.body.classList.toggle("boot-on", v === "boot");
    if (v !== "home" && v !== "boot") render();
    if (v === "log") paintOrb();
  }

  // ------------------------------------------------------------ meeting MIA (core/first_boot.py)
  // The engine's beats, played in order: the swarm forms, flares, collapses
  // into her orb, and she speaks. Select pauses, move skips a beat, back
  // skips the rest. Finished parts are saved as they end, so leaving comes
  // back here. Her voice where this MIA has one; the words always show.
  const bootBox = $("boot");
  let beats = [], beatAt = 0, beatTimer = null, beatAudio = null, bootPaused = false;
  function bootSky() {
    const swarm = bootBox.querySelector(".b-swarm");
    if (swarm.childElementCount) return;
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * Math.PI * 2, d = 165 * Math.sqrt(Math.random()), s = 1.5 + Math.random() * 3;
      const dot = el("i");
      dot.style.cssText = "left:" + (180 + Math.cos(a) * d - s / 2).toFixed(1) + "px;top:" + (180 + Math.sin(a) * d - s / 2).toFixed(1) +
        "px;width:" + s.toFixed(1) + "px;height:" + s.toFixed(1) + "px;animation-delay:" + (Math.random() * 3.6).toFixed(2) + "s";
      swarm.append(dot);
    }
    const wave = bootBox.querySelector(".b-wave");
    for (let i = 0; i < 17; i++) {
      const bar = el("i");
      bar.style.cssText = "height:" + (10 + Math.round(18 * Math.abs(Math.sin(i * 1.7)))) + "px;animation-delay:" + (i * 0.07).toFixed(2) + "s";
      wave.append(bar);
    }
  }
  function saveBoot(kind, params) {
    if (demo) return;
    MIA.propose(kind, params).then((p) => MIA.approve(p.proposal_id)).catch(() => { /* asked again next time */ });
  }
  function stopVoice() {
    if (beatAudio) { beatAudio.onended = null; beatAudio.pause(); beatAudio = null; }
  }
  function bootHint() {
    $("boot-keys").innerHTML = "<b>●</b> " + (bootPaused ? "resume" : "pause") + " &nbsp;·&nbsp; <b>▶</b> skip &nbsp;·&nbsp; <b>▼</b> skip all";
    bootBox.classList.toggle("paused", bootPaused);
  }
  function playBeat() {
    const beat = beats[beatAt];
    if (!beat) { endBoot(); return; }
    bootBox.dataset.look = beat.look;
    const line = $("boot-line");
    if (line.textContent !== beat.say) {  // a new line fades in
      line.textContent = beat.say;
      line.classList.remove("in");
      void line.offsetWidth;
      if (beat.say) line.classList.add("in");
    }
    const started = performance.now();
    if (beat.speak && !demo) {
      MIA.speak(beat.say).then((said) => {
        if (beats[beatAt] !== beat || bootPaused) return;
        beatAudio = new Audio("data:audio/wav;base64," + said.audio_wav_base64);
        beatAudio.play().catch(() => { beatAudio = null; });
      }).catch(() => { /* no voice here: the words still show */ });
    }
    const atEnd = () => {
      if (bootPaused) return;
      if (beatAudio && !beatAudio.paused && !beatAudio.ended) { beatAudio.onended = nextBeat; return; }  // let her finish
      nextBeat();
    };
    beatTimer = setTimeout(atEnd, Math.max(0, beat.seconds * 1000 - (performance.now() - started)));
  }
  function nextBeat() {
    clearTimeout(beatTimer);
    stopVoice();
    const was = beats[beatAt];
    beatAt += 1;
    const next = beats[beatAt];
    if (was && (!next || next.phase !== was.phase)) saveBoot("firstboot.advance", { phase: was.phase });
    playBeat();
  }
  function bootPause() {
    bootPaused = !bootPaused;
    bootHint();
    clearTimeout(beatTimer);
    if (bootPaused) { if (beatAudio) beatAudio.pause(); return; }
    stopVoice();
    playBeat();  // the line again, from its start
  }
  function endBoot() {
    clearTimeout(beatTimer);
    stopVoice();
    const finished = beats.length && beatAt >= beats.length;
    beats = [];
    lastInput = Date.now();
    show("home");
    if (finished) startSync();
  }
  function skipBoot() {
    saveBoot("firstboot.skip", {});
    endBoot();
  }
  async function startBoot() {
    let left;
    try { left = await MIA.firstBoot(); } catch (e) { return false; }
    if (!left || left.done || !(left.beats || []).length) return false;
    beats = left.beats; beatAt = 0; bootPaused = false;
    bootSky();
    show("boot");
    bootHint();
    playBeat();
    return true;
  }

  // ------------------------------------------------------------ User Sync (core/user_sync.py)
  // Her question, what she heard, and what she'd set up. You answer out loud
  // (the phone hears you; its answers reach here as feed cards) or on the
  // phone. At the chips, move picks one: select drops it, or saves on "Looks
  // right". Back is "let's finish later". Her voice is the phone's when you
  // spoke; a line from a select here, she says through this screen.
  // First the phone's permissions, as the phone reports them, and between
  // topics she offers to keep going. This screen follows the phone: it
  // re-reads while it's up, so typing there and Allow show here too.
  const SYNC_POLL_MS = 3000;
  let sync = null, syncLeft = false, syncRow = 0, syncPainted = "";
  function sayHere(text) {
    if (!text || demo) return;
    MIA.speak(text).then((said) => { new Audio("data:audio/wav;base64," + said.audio_wav_base64).play().catch(() => {}); }).catch(() => {});
  }
  async function checkSync() {
    try { const now = await MIA.userSync(); syncLeft = !!now && !now.done && !!(now.paused || now.offer || now.active); return now; }
    catch (e) { syncLeft = false; return null; }
  }
  function paintSync(now, say) {
    sync = now; syncRow = Math.min(syncRow, (now.chips || []).length);
    syncLeft = !now.done;
    syncPainted = JSON.stringify({ ...now, say: "" });
    if (now.done || now.paused) {
      show("home");
      if (say) { answer(say, 9); sayHere(say); }
      if (now.done) setTimeout(startWelcome, WELCOME_WAIT_MS);
      return;
    }
    sayHere(say);
    show("sync");
  }
  async function startSync() {
    try { const now = await MIA.userSyncStep({ choice: "start" }); paintSync(now, now.say); }
    catch (e) { show("home"); }
  }
  async function syncStep(step) {
    try { const now = await MIA.userSyncStep(step); paintSync(now, now.say); }
    catch (err) { answer(err.message, 6); }
  }
  async function refreshSync() {
    const now = await checkSync();
    if (now && view === "sync" && JSON.stringify({ ...now, say: "" }) !== syncPainted) paintSync(now);
  }
  setInterval(() => { if (view === "sync" && !demo) refreshSync(); }, SYNC_POLL_MS);
  function syncScreen() {
    const s = sync || {};
    const wrap = el("div", "sync");
    ["tl", "tr", "bl", "br"].forEach((k) => wrap.append(el("i", "rc " + k)));
    const top = el("div", "s-top");
    const who = el("span", "s-who");
    who.append(el("i", "log-orb"), el("span", "log-state", "MIA"));
    top.append(who, el("span", "s-topic", s.step === "phone" ? "Approve on your phone" : "Topic " + esc(s.number) + " of " + esc(s.topics) + " · " + esc(s.title)));
    wrap.append(top, el("h1", "s-q", esc(s.question)));
    if (s.heard) {
      const you = el("div", "s-you");
      you.append(el("span", "who", "You"), el("p", "", "“" + esc(s.heard) + "”"));
      wrap.append(you);
    }
    if (s.step === "phone") {
      const rows = el("div", "s-rows");
      s.rows.forEach((r) => {
        const row = el("div", "s-row " + (r.status === "allowed" ? "on" : ""));
        row.append(el("span", "", esc(r.label)), el("span", "s-note", r.status === "allowed" ? "Allowed" : r.status === "not yet" ? "Not yet" : "On your phone"));
        rows.append(row);
      });
      wrap.append(rows);
    }
    const n = (s.chips || []).length;
    if (s.step === "review") {
      const chips = el("div", "s-chips");
      s.chips.forEach((c, i) => {
        const chip = el("div", "s-chip" + (i === syncRow ? " sel" : ""));
        chip.append(el("span", "a", esc(c.app)), el("span", "", " · " + esc(c.text)));
        chip.dataset.chip = String(i);
        chips.append(chip);
      });
      const yes = el("div", "s-chip s-yes" + (syncRow === n ? " sel" : ""), "✓ Looks right");
      yes.dataset.chip = "yes";
      chips.append(yes);
      wrap.append(el("p", "s-label", "MIA is setting up"), chips);
    }
    if (s.phone_only) wrap.append(el("p", "s-label", "Money stays on your phone"));
    const SYNC_HINTS = { phone: "<b>●</b> skip this for now &nbsp;·&nbsp; <b>▼</b> finish later",
      next: "<b>●</b> keep going &nbsp;·&nbsp; <b>▶</b> skip this topic &nbsp;·&nbsp; <b>▼</b> finish later" };
    wrap.append(el("p", "s-hint", s.phone_only ? "<b>▶</b> skip that one &nbsp;·&nbsp; <b>▼</b> finish later" : SYNC_HINTS[s.step] || (s.step === "review"
      ? (syncRow === n ? "<b>●</b> save these" : "<b>●</b> drop this one") + " &nbsp;·&nbsp; <b>▶</b> next &nbsp;·&nbsp; <b>▼</b> finish later"
      : "Answer out loud &nbsp;·&nbsp; <b>▶</b> skip that one &nbsp;·&nbsp; <b>▼</b> finish later")));
    const foot = el("div", "s-foot");
    foot.append(el("span", "", "User Sync"), el("div", "m-bar", '<i style="width:' + Number(s.percent || 0) + '%"></i>'));
    wrap.append(foot);
    return wrap;
  }

  // ------------------------------------------------------------ the first mission and tours (core/welcome.py)
  // "Synchronization complete", the mission, Home's tour, the app menu with
  // its optional tours, then she hands over. Select goes on, move picks, back
  // leaves it for later: a card brings it back. Stages and words are the engine's.
  const WELCOME_WAIT_MS = 7000, READY_MS = 6000;
  let welcome = null, welcomeLeft = false, welcomeRow = 0, welcomeActs = false, welcomeAct = 0, readyUntil = 0;
  const APP_ACTS = [["tour", "Start tour"], ["open", "Just open it"], ["later", "Later"]];
  async function checkWelcome() {
    try { const now = await MIA.welcome(); welcomeLeft = !!(now && now.left); return now; }
    catch (e) { welcomeLeft = false; return null; }
  }
  function paintWelcome(now, say) {
    welcome = now; welcomeLeft = !!now.left; welcomeRow = 0; welcomeActs = false; welcomeAct = 0;
    if (now.open !== undefined) {
      show("home");
      const at = cards().findIndex((c) => c.id === now.open);
      if (at >= 0) { appIndex = at; menuIndex = 0; row = 0; show("menu"); }
      return;
    }
    if (!now.left || now.paused) { show("home"); if (say) { answer(say, 6); sayHere(say); } return; }
    sayHere(say);
    show("welcome");
  }
  async function startWelcome() {
    if (view !== "home") return;
    const now = await checkWelcome();
    if (!now || !now.left || now.paused) return;
    if (now.ready) { readyUntil = Date.now() + READY_MS; setTimeout(render, READY_MS + 50); }
    paintWelcome(now);
  }
  async function welcomeStep(choice, appId) {
    try { const now = await MIA.welcomeStep({ choice, app: appId || "" }); paintWelcome(now, now.say); }
    catch (err) { answer(err.message, 6); }
  }
  function welcomeFrame(parts, hintHtml, label, percent) {
    const wrap = el("div", "sync welcome");
    ["tl", "tr", "bl", "br"].forEach((k) => wrap.append(el("i", "rc " + k)));
    wrap.append(...parts, el("p", "s-hint", hintHtml));
    const foot = el("div", "s-foot");
    foot.append(el("span", "", esc(label)), el("div", "m-bar", '<i style="width:' + Number(percent || 0) + '%"></i>'));
    wrap.append(foot);
    return wrap;
  }
  function tiles(list) {
    const grid = el("div", "w-tiles");
    list.forEach((t) => grid.append(el("div", "w-tile" + (t.on ? " on" : ""), t.html || esc(t.label))));
    return grid;
  }
  function welcomeScreen() {
    const w = welcome || {};
    if (Date.now() < readyUntil) {
      const box = el("div", "w-ready");
      box.append(el("i", "log-orb"), el("p", "w-big", "Synchronization complete."), el("p", "s-label", "Your system is ready"));
      return welcomeFrame([box], "", "Sync complete", 100);
    }
    if (w.stage === "mission") {
      const m = w.mission, box = el("div", "w-card");
      box.append(el("p", "s-label", "Tutorial · Mission 1"), el("h1", "s-q", esc(m.name)), el("p", "w-sum", esc(m.summary)));
      m.objectives.forEach((o) => box.append(el("p", "w-obj" + (o.done ? " on" : ""), (o.done ? "✓ " : "○ ") + esc(o.text))));
      const top = el("p", "s-label", "Mission unlocked · +" + esc(m.xp) + " XP");
      return welcomeFrame([top, box], "<b>●</b> begin &nbsp;·&nbsp; <b>▼</b> later", "Welcome", m.percent);
    }
    if (w.tour) {
      const t = w.tour, box = el("div", "w-card");
      box.append(el("div", "s-top", "<span>" + esc(t.name) + "</span><span>" + esc(t.number) + " of " + esc(t.of) + "</span>"), el("p", "w-sum", esc(t.text)));
      return welcomeFrame([tiles(t.tiles), box], "<b>●</b> next &nbsp;·&nbsp; <b>▶</b> skip the tour &nbsp;·&nbsp; <b>▼</b> later", t.name + " tour", 100 * t.number / t.of);
    }
    if (w.stage === "apps") {
      const a = w.apps[welcomeRow] || {};
      const box = el("div", "w-card");
      box.append(el("p", "s-label", esc(a.name)), el("p", "w-sum", esc(a.intro ? [a.intro.what].concat(a.intro.yours).join(" ") : "")));
      if (welcomeActs) {
        const acts = el("div", "s-chips");
        APP_ACTS.forEach((act, i) => acts.append(el("div", "s-chip" + (i === welcomeAct ? " sel" : ""), esc(act[1]))));
        box.append(acts);
      }
      const list = w.apps.map((x, i) => ({ on: i === welcomeRow, html: esc(x.name) + "<small>" + esc(x.status) + "</small>" }));
      const top = el("div", "s-top", "<span>Your apps</span><span>Every tour is optional</span>");
      return welcomeFrame([top, tiles(list), box], welcomeActs ? "<b>▶</b> move &nbsp;·&nbsp; <b>●</b> choose &nbsp;·&nbsp; <b>▼</b> back"
        : "<b>▶</b> move &nbsp;·&nbsp; <b>●</b> this one &nbsp;·&nbsp; <b>▼</b> later", "App menu", w.mission.percent);
    }
    const box = el("div", "w-end");
    box.append(el("p", "s-label", "✓ Mission complete · " + esc(w.mission.name) + " · +" + esc(w.mission.xp) + " XP"),
      el("p", "w-sum", "You don't have to figure everything out today. Whenever you need me, just tap and talk."),
      el("p", "w-big", "Now then… what would you like to do first?"));
    const ideas = el("div", "s-chips");
    w.ideas.forEach((idea, i) => ideas.append(el("div", "s-chip" + (i === welcomeRow ? " sel" : ""), esc(idea.label))));
    box.append(ideas);
    return welcomeFrame([box], "<b>▶</b> move &nbsp;·&nbsp; <b>●</b> choose", "Yours to explore", 100);
  }
  function welcomeMove(dir) {
    const w = welcome;
    if (w.stage === "home" || w.stage === "tour") { if (dir > 0) welcomeStep("skip"); return; }
    if (welcomeActs) welcomeAct = (welcomeAct + dir + APP_ACTS.length) % APP_ACTS.length;
    else if (w.stage === "apps") welcomeRow = (welcomeRow + dir + w.apps.length) % w.apps.length;
    else if (w.stage === "explore") welcomeRow = (welcomeRow + dir + w.ideas.length) % w.ideas.length;
    render();
  }
  async function welcomeSelect() {
    const w = welcome;
    if (Date.now() < readyUntil) return;
    if (w.stage === "mission") { await welcomeStep("begin"); return; }
    if (w.stage === "home" || w.stage === "tour") { await welcomeStep("next"); return; }
    if (w.stage === "apps" && !welcomeActs) { welcomeActs = true; welcomeAct = 0; render(); return; }
    if (w.stage === "apps") { await welcomeStep(APP_ACTS[welcomeAct][0], w.apps[welcomeRow].id); return; }
    const idea = w.ideas[welcomeRow];
    await welcomeStep("finish");
    if (idea.say) { resultText = "…"; after = "home"; show("result");
      try { const turn = await MIA.talk(idea.say); resultText = turn.reply_text || "Done."; } catch (err) { resultText = err.message; }
      render();
    } else listen();
  }

  // ------------------------------------------------------------ Ambient: the whole conversation
  // Her small orb in the corner and everything said, the same thread as the
  // phone and the computer (/api/talk/thread). Move scrolls; select talks.
  const LOG_STEP = 150;
  let thread = [];
  async function openLog() {
    try { thread = ((await MIA.history(200)).messages || []).filter((m) => m.role === "user" || m.role === "assistant"); }
    catch (e) { /* keep what's showing */ }
    show("log");
    const box = document.querySelector(".log-scroll");
    if (box) box.scrollTop = box.scrollHeight;  // newest at the bottom
  }
  function logScreen() {
    const wrap = el("div", "log");
    const top = el("div", "log-top");
    top.append(el("i", "log-orb"), el("span", "log-state", "MIA"));
    const box = el("div", "log-scroll");
    if (!thread.length) box.append(el("p", "empty", "Nothing yet. Select to talk to her."));
    thread.forEach((m) => {
      const mine = m.role === "user";
      const msg = el("div", "msg " + (mine ? "you" : "mia"));
      msg.append(el("span", "who", mine ? "You" : "MIA"), el("p", "", esc(m.content)));
      box.append(msg);
    });
    wrap.append(top, box, hint("talk"));
    return wrap;
  }

  function render() {
    const a = app();
    const parts = [];
    if (view === "cards") {
      const list = cards();
      if (!a) {
        parts.push(kicker("Apps"), el("div", "body", '<p class="empty">MIA couldn\'t load your apps.</p>'), hint("back"));
      } else {
        parts.push(dashScreen(list, a));
      }
    } else if (view === "menu") {
      const rows = menuRows(a);
      const inside = a.id === "missions" && a.mission !== undefined ? missionBoard(a, rows) : [...appTiles(a), ...rowsOf(rows, row)];
      parts.push(appFrame(a, a.id === "missions" ? "" : a.status, "", inside, rows[row] && rows[row].back ? "go back" : "choose"));
    } else if (view === "panel" && isCarousel()) {
      const item = (a.menu || [])[menuIndexOf()] || {};
      const rows = panelRows(), r = rows[row];
      const body = el("div", "body");
      if (r.back) body.append(el("div", "card", '<p class="name">Back</p>'));
      else {
        const rec = r.line.recipe;
        const card = el("div", "recipe-card");
        card.append(recipePhoto(rec, "photo"), el("p", "r-name", esc(rec.name)));
        if (r.detail) card.append(el("p", "status", esc(r.detail)));
        body.append(card);
      }
      parts.push(appFrame(a, (crumbs.length && panel ? panel.label : item.label) || "", (row + 1) + " of " + rows.length, [body], r.back ? "go back" : "open recipe"));
    } else if (view === "recipe") {
      const pages = recipePages(recipe), pg = pages[page];
      const body = el("div", "body");
      if (pg.kind === "cover") {
        const card = el("div", "recipe-card");
        card.append(recipePhoto(recipe, "photo"), el("p", "r-name", esc(recipe.name)));
        card.append(el("p", "status", esc(recipe.ingredients.length + " ingredients · " + recipe.steps.length + " steps")));
        body.append(card);
      } else if (pg.kind === "ingredients") {
        body.append(el("p", "title", "Ingredients"));
        const ul = el("ul", "r-list");
        pg.items.forEach((t) => ul.append(el("li", "", esc(t))));
        body.append(ul);
      } else {
        body.append(el("p", "title", "Step " + pg.n + " Of " + recipe.steps.length), el("p", "r-step" + (pg.text.length > 180 ? " long" : ""), esc(pg.text)));
      }
      parts.push(appFrame(a, recipe.name, (page + 1) + " of " + pages.length, [body], cookNext() ? "I made this" : "back to recipes"));
    } else if (view === "panel") {
      const item = (a.menu || [])[menuIndexOf()] || {};
      const body = el("div", "body");
      const rows = panelRows();
      if (!panel) body.append(el("p", "empty", "…"));
      else {
        if (panel.title && panel.title !== item.label) body.append(el("p", "title", esc(panel.title)));
        if (!panel.lines.length) body.append(el("p", "empty", esc(panel.empty || "Nothing here.")));
        else if (rows.length === (sorts() ? 2 : 1)) body.append(el("p", "empty", "Nothing here."));
        body.append(...rowsOf(rows, row));
        if (panel.more) body.append(el("p", "more", "+ " + panel.more + " more on your phone"));
      }
      const r = rows[row] || BACK_ROW;
      const line = r.line;
      parts.push(appFrame(a, (crumbs.length && panel ? panel.label : item.label) || "", "", [body],
        r.back ? "go back" : r.kind === "sort" ? "change sort" : line && (actionOf(line) || line.pick || line.open || line.play) ? (actionOf(line) || line.pick || line.open || line.play).label : "—"));
    } else if (view === "confirm") {
      const body = el("div", "body");
      body.append(el("p", "say", esc(proposal ? proposal.summary : "")));
      body.append(...rowsOf([{ text: "Approve", verb: "✓" }, { text: "Cancel", kind: "cancel" }], row));
      parts.push(kicker("Confirm"), body, hint(row === 0 ? "approve" : "cancel"));
    } else if (view === "result") {
      const body = el("div", "body");
      body.append(el("p", "say small", esc(resultText)));
      parts.push(kicker(a ? a.name : "MIA"), body, hint("continue"));
    } else if (view === "reward") {
      parts.push(rewardScreen(reward), hint("continue"));
    } else if (view === "hud") {
      parts.push(hudScreen());
    } else if (view === "log") {
      parts.push(logScreen());
    } else if (view === "sync") {
      parts.push(syncScreen());
    } else if (view === "welcome") {
      parts.push(welcomeScreen());
    } else if (view === "player") {
      parts.push(playerScreen(a));
    }
    screen.replaceChildren(...parts);
  }

  // ------------------------------------------------------------ Heads-Up (Zac, 2026-10-18)
  // Blank (see-through on the Display) until something happens anywhere:
  // a card slides in ("Mission Complete", "+50 XP", "Debt Payment"), stays
  // HUD_SHOW_MS, and the view clears again. Cards come from
  // MIA.glassesFeed (core/glasses_feed.py) with a cursor, so each shows once.
  // Swipe down on the orb (or wait HUD_IDLE_MS on it) to enter; any input leaves.
  const HUD_POLL_MS = 4000, HUD_SHOW_MS = 6000, HUD_IDLE_MS = 60000;
  let hudCursor = null, hudQueue = [], hudCard = null, hudTimer = null, lastInput = Date.now();

  function hudScreen() {
    const wrap = el("div", "hud");
    wrap.append(el("i", "hud-dot"));  // a faint mark: Heads-Up is on
    if (hudCard) {
      const c = el("div", "hud-card" + (hudCard.level === "warning" || hudCard.level === "critical" ? " attn" : ""));
      ["tl", "tr", "bl", "br"].forEach((k) => c.append(el("i", "rc " + k)));
      c.append(el("p", "h-icon", esc(hudCard.icon || "✦")), el("p", "h-head", esc(hudCard.headline || "")));
      if (hudCard.xp) c.append(el("p", "h-xp", "+" + esc(hudCard.xp) + " XP"));
      if (hudCard.text) c.append(el("p", "h-text", esc(hudCard.text)));
      wrap.append(c);
    }
    return wrap;
  }
  function hudNext() {
    clearTimeout(hudTimer);
    hudCard = hudQueue.shift() || null;
    if (view === "hud") render();
    if (!hudCard) return;
    if (window.MIASound) MIASound.play(/level/i.test(hudCard.headline) ? "fanfare" : /mission|quest/i.test(hudCard.headline) ? "quest" : "chime");
    hudTimer = setTimeout(() => { hudCard = null; if (view === "hud") render(); hudTimer = setTimeout(hudNext, 600); }, HUD_SHOW_MS);
  }
  // One feed for every view, polled all the time: Heads-Up shows its
  // cards, and talking to MIA through the phone (core/glasses_voice.py)
  // reaches whatever's on screen. The first call only sets the cursor
  // (nothing old is replayed); ids are remembered so a card never shows twice.
  const seen = new Set();
  async function hudFetch() {
    try {
      const first = hudCursor === null;
      const got = await MIA.glassesFeed(hudCursor);
      hudCursor = got.now || hudCursor;
      const fresh = (got.items || []).filter((c) => !seen.has(c.id));
      fresh.forEach((c) => seen.add(c.id));
      if (first) return;
      for (const c of fresh) {
        if (c.level === "voice") { heard(c); continue; }
        if (view === "hud") hudQueue.push(c);
      }
      if (view === "hud" && hudQueue.length && !hudCard) hudNext();
    } catch (e) { /* off-line for a moment: try again next time */ }
  }
  // What you said through the glasses (the phone heard it): open the app you
  // named, or show MIA's answer under her orb. Her voice is already in your ear.
  function heard(c) {
    if (view === "boot") return;
    lastInput = Date.now();
    if (view === "welcome") {  // "next", "skip the tour": the screen follows
      MIA.welcome().then((now) => { if (view === "welcome") paintWelcome(now); }).catch(() => {});
      return;
    }
    if (c.sync) {  // an answer in User Sync, from wherever this screen is
      refreshSync().then(() => { if (view !== "sync") { if (syncLeft) startSync(); else startWelcome(); } });
      return;
    }
    if (c.open !== undefined) {
      if (!c.open) { show("home"); answer(c.text, 5); return; }
      let i = (data && data.apps || []).findIndex((a) => a.id === c.open);
      showingAll = i < 0;
      if (showingAll) i = (data && data.others || []).findIndex((a) => a.id === c.open);
      if (i >= 0) { appIndex = i; menuIndex = 0; row = 0; panel = null; show("menu"); return; }
    }
    if (view === "hud") { hudQueue.push(c); if (!hudCard) hudNext(); return; }
    if (view === "log") { openLog(); load(); return; }
    show("home");
    answer(c.text, 9);
    load();  // a change you asked for shows on the cards
  }
  async function hudStart() {
    hudCard = null; hudQueue = [];
    show("hud");
  }
  function hudStop() { clearTimeout(hudTimer); hudCard = null; hudQueue = []; }
  setInterval(hudFetch, HUD_POLL_MS);
  setInterval(() => {  // the orb, left alone: fade to Heads-Up
    if (view === "home" && voiceState === "idle" && Date.now() - lastInput > HUD_IDLE_MS) hudStart();
  }, 5000);
  ["keydown", "pointerdown"].forEach((t) => addEventListener(t, () => { lastInput = Date.now(); }, true));

  // The reward (Zac's concept, 2026-10-16): "Objective Complete ☆ +30 XP
  // ✓ Quest Complete" in a HUD frame. From the engine's proposal.reward
  // (core/actions.reward_for); the XP counts up, then select continues.
  function rewardScreen(r) {
    const box = el("div", "reward" + (r.level_up ? " level-up" : ""));
    ["tl", "tr", "bl", "br"].forEach((c) => box.append(el("i", "rc " + c)));
    box.append(el("p", "r-head", esc(r.headline)), el("p", "r-star", "☆"));
    const big = r.xp ? "+" + r.xp + " XP" : r.credits ? "+" + r.credits + " Credits" : "✓";
    const amount = el("p", "r-xp", esc(big));
    box.append(amount);
    if (r.xp) {  // count up
      const start = performance.now(), total = r.xp;
      const step = (now) => {
        const t = Math.min(1, (now - start) / 900);
        amount.textContent = "+" + Math.round(total * (1 - Math.pow(1 - t, 3))) + " XP";
        if (t < 1 && view === "reward") requestAnimationFrame(step);
      };
      amount.textContent = "+0 XP";
      requestAnimationFrame(step);
    }
    const label = r.headline === "Mission Complete" ? "Quest Complete" : r.ready ? "All Objectives Done · Claim It"
      : r.total ? r.done + " / " + r.total + " Objectives" : r.headline;
    const pct = r.headline === "Mission Complete" || r.ready ? 100 : r.total ? Math.round(100 * r.done / r.total) : 100;
    const bar = el("div", "r-bar");
    const fill = el("span", "r-fill");
    fill.style.width = pct + "%";
    bar.append(fill, el("span", "r-label", "✓ " + esc(label)));
    box.append(bar);
    const sub = [r.name && r.name !== r.headline ? r.name : null, r.credits && r.xp ? "+" + r.credits + " credits" : null,
      r.level_up ? "Level " + r.level + "!" : null].filter(Boolean).join(" · ");
    if (sub) box.append(el("p", "r-sub", esc(sub)));
    return box;
  }

  // ------------------------------------------------------------ the two moves (and back)
  let menuIndex = 0;
  function menuIndexOf() { return menuIndex; }

  function move(dir) {
    if (busy) return;
    if (view === "boot") { if (dir > 0) nextBeat(); return; }
    if (view === "hud") { show("home"); return; }
    if (view === "sync") {
      if (sync.step === "review" && !sync.phone_only) { const n = sync.chips.length + 1; syncRow = (syncRow + dir + n) % n; render(); }
      else if (dir > 0) syncStep({ choice: "skip" });
      return;
    }
    if (view === "welcome") { welcomeMove(dir); return; }
    if (view === "player") { playerRow = (playerRow + dir + PLAYER_CHIPS.length) % PLAYER_CHIPS.length; render(); return; }
    if (view === "log") {
      const box = document.querySelector(".log-scroll");
      if (box) box.scrollTop += dir * LOG_STEP;
      return;
    }
    if (view === "home") {
      if (voiceState === "listening" || voiceState === "thinking") stopListening();
      const list = cards();
      if (!list.length) {  // the apps didn't load (a bad connection, a half-updated page): try again
        load().then(() => {
          if (cards().length) move(dir);
          else answer("MIA couldn't load your apps. Check the connection and try again.", 5);
        });
        return;
      }
      appIndex = dir > 0 ? 0 : list.length - 1;
      show("cards");
      return;
    }
    if (view === "cards") {
      const n = cards().length;
      const next = appIndex + dir;
      if (!showingAll && (next < 0 || next >= n)) { show("home"); return; }  // the orb sits between the ends
      appIndex = (next + n) % n;
      render();
      return;
    }
    if (view === "recipe") {
      const n = recipePages(recipe).length;
      page = Math.max(0, Math.min(n - 1, page + dir)); render(); return;
    }
    const count = view === "menu" ? menuRows(app()).length : view === "panel" ? (panel ? panelRows().length : 0)
      : view === "confirm" ? 2 : 0;
    if (count) { row = (row + dir + count) % count; render(); }
  }

  async function select() {
    if (busy) return;
    busy = true;
    try { await doSelect(); } finally { busy = false; }
  }
  async function doSelect() {
    const a = app();
    if (view === "boot") { bootPause(); return; }
    if (view === "hud") { show("home"); return; }
    if (view === "home" || view === "log") { listen(); return; }
    if (view === "welcome") { await welcomeSelect(); return; }
    if (view === "player") { if (playing && playing.track) await playerPress(); return; }
    if (view === "sync") {
      if (sync.step === "phone") { await syncStep({ choice: "skip" }); return; }
      if (sync.step === "next") { await syncStep({ choice: "continue" }); return; }
      if (sync.step !== "review" || sync.phone_only) return;  // she's listening: answers come out loud
      await syncStep(syncRow === sync.chips.length ? { choice: "approve" } : { choice: "drop", index: syncRow });
      return;
    }
    if (view === "cards") {
      if (!a) return;
      if (a.id === "__sync") { await startSync(); return; }
      if (a.id === "__welcome") { await welcomeStep("resume"); return; }
      if (a.id === "__log") { await openLog(); return; }
      if (a.id === "__all") { showingAll = true; appIndex = 0; render(); return; }
      if (a.id === "__back") { showingAll = false; appIndex = Math.max(0, cards().length - 1); render(); return; }
      menuIndex = 0; row = 0; show("menu");
      return;
    }
    if (view === "menu") {
      const rows = menuRows(a);
      if (rows[row].back) { row = 0; show("cards"); return; }
      menuIndex = row;
      const item = a.menu[row];
      if (item.type === "ask") {
        resultText = "…"; after = "menu"; show("result");
        try { const turn = await MIA.talk(item.say); resultText = turn.reply_text || "Done."; }
        catch (err) { resultText = err.message; }
        render();
        return;
      }
      if (item.type === "action") { await propose(item.action, "reload"); return; }
      if (item.type === "player") { await openPlayer(); return; }
      await openPanel();
      return;
    }
    if (view === "recipe") {
      if (cookNext()) { await propose(recipe.action, "panel"); return; }
      row = Math.max(0, row); show("panel"); return;
    }
    if (view === "panel") {
      if (!panel) return;
      const rows = panelRows();
      if (rows[row].back) { leavePanel(); return; }
      if (rows[row].kind === "sort") { sortIndex = (sortIndex + 1) % sorts().length; render(); return; }
      const line = rows[row].line;
      if (line.recipe) { recipe = line.recipe; page = 0; show("recipe"); return; }
      if (line.open) { await openDeeper(line.open.item); return; }
      if (line.play) { await playFrom(line.play); return; }
      if (line.pick) {  // which mission the Missions card shows
        mission = line.pick.mission; store.set("mia.glasses.mission", mission);
        await load();
        const at = cards().findIndex((c) => c.id === "missions");
        if (at >= 0) appIndex = at;
        panel = null; row = 0; show("cards");
        return;
      }
      if (actionOf(line)) await propose(actionOf(line), "panel");
      return;
    }
    if (view === "confirm") {
      if (row === 1) { cancel(); return; }
      try {
        const done = await MIA.approve(proposal.proposal_id);
        resultText = done.result || done.summary || "Done.";
        if (done.status === "executed" && done.reward) {
          reward = done.reward; proposal = null; show("reward");
          if (window.MIASound) MIASound.celebrate(reward);  // a quest-complete chime on the glasses (DEC-0028 #11)
          clearTimeout(rewardTimer);
          rewardTimer = setTimeout(() => { if (view === "reward") leaveResult(); }, 6000);
          return;
        }
      } catch (err) { resultText = err.message; }
      proposal = null; show("result");
      return;
    }
    if (view === "result" || view === "reward") { clearTimeout(rewardTimer); await leaveResult(); }
  }

  async function propose(action, then) {
    if (action.quick) {  // the live workout: this press is the yes (DEC-0065)
      try { const p = await MIA.propose(action.kind, action.params); await MIA.approve(p.proposal_id); await refreshPanel(); }
      catch (err) { resultText = err.message; after = then; show("result"); }
      return;
    }
    try { proposal = await MIA.propose(action.kind, action.params); after = then; row = 0; show("confirm"); }
    catch (err) { resultText = err.message; after = then === "reload" ? "menu" : "panel"; show("result"); }
  }
  function cancel() {
    if (proposal) MIA.reject(proposal.proposal_id).catch(() => {});
    proposal = null;
    if (after === "reload") { row = menuIndex; show("menu"); } else { row = 0; show("panel"); }
  }
  // The same panel again, where you are in it: after a change, or while it's live.
  async function refreshPanel() {
    const a = app();
    if (!a || !panelItem) return;
    try { panel = await MIA.glassesPanel(a.id, panelItem, mission); }
    catch (err) { return; }
    row = Math.min(row, panelRows().length - 1);
    if (view === "panel") render();
  }
  setInterval(() => { if (view === "panel" && panel && panel.live && !busy && !demo) refreshPanel(); }, LIVE_MS);
  // One step deeper than a panel (a vehicle in Garage): Back returns to the list.
  async function openDeeper(item) {
    crumbs.push({ panel, item: panelItem }); panel = null; panelItem = item; row = 0; show("panel");
    try { panel = await MIA.glassesPanel(app().id, item, mission); }
    catch (err) { panel = { lines: [], empty: err.message, more: 0 }; }
    if (view === "panel") render();
  }
  function leavePanel() {
    if (crumbs.length) { const up = crumbs.pop(); panel = up.panel; panelItem = up.item; row = 0; show("panel"); return; }
    row = menuIndex; panel = null; show("menu");
  }
  // On a recipe's last page, select says you made it, where the action reached here.
  function cookNext() { return !!(recipe && recipe.action && page === recipePages(recipe).length - 1); }
  async function openPanel() {
    const a = app(), item = a && a.menu[menuIndex];
    panel = null; row = 0; sortIndex = 0; crumbs = []; panelItem = item.id; show("panel");
    try { panel = await MIA.glassesPanel(a.id, item.id, mission); }
    catch (err) { panel = { lines: [], empty: err.message, more: 0 }; }
    row = panel.live ? Math.max(0, panelRows().findIndex((r) => r.line && actionOf(r.line))) : 0;
    if (view === "panel") render();
  }
  // Location quests (DEC-0028 #13): arriving at the store opens the grocery
  // list right here on the glasses; anything else is MIA's line.
  if (window.MIAPlaces) {
    MIAPlaces.onArrive = async (place) => {
      await load();
      const list = cards();
      const at = list.findIndex((c) => c.id === "kitchen");
      const item = at >= 0 && (place.open || "").indexOf("#grocery") >= 0 ? (list[at].menu || []).findIndex((m) => m.id === "grocery") : -1;
      if (item >= 0) { appIndex = at; menuIndex = item; await openPanel(); return; }
      resultText = place.say; after = "menu"; show("result");
    };
  }
  async function leaveResult() {
    if (after === "panel") { await load(); show("panel"); await refreshPanel(); return; }
    if (after === "reload") {  // pins changed: re-read the cards, stay with this app
      const id = (app() || {}).id;
      await load();
      const d = data || {};
      showingAll = !!d.pinned && !(d.apps || []).some((c) => c.id === id);
      const at = cards().findIndex((c) => c.id === id);
      appIndex = at >= 0 ? at : 0; row = 0; show("cards");
      return;
    }
    row = menuIndex; show("menu");
  }

  function back() {
    if (busy) return;
    if (view === "boot") { skipBoot(); return; }
    if (view === "sync") { syncStep({ choice: "later" }); return; }
    if (view === "welcome") {
      if (welcomeActs) { welcomeActs = false; render(); } else welcomeStep("later");
      return;
    }
    if (view === "hud" || view === "log") { show("home"); return; }
    if (view === "player") { row = afterPlayer === "menu" ? menuIndex : row; show(afterPlayer); return; }
    if (view === "home") {
      if (voiceState === "answered") { orbState("idle"); return; }
      hudStart();  // swipe down on the orb: Heads-Up
      return;
    }
    if (view === "confirm") { cancel(); return; }
    if (view === "result" || view === "reward") { clearTimeout(rewardTimer); leaveResult(); return; }
    if (view === "recipe") { show("panel"); return; }
    if (view === "panel") { leavePanel(); return; }
    if (view === "menu") { row = 0; show("cards"); return; }
    if (showingAll) { showingAll = false; appIndex = Math.max(0, cards().length - 1); render(); return; }
    show("home");
  }

  // ------------------------------------------------------------ input
  document.addEventListener("keydown", (e) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown") { e.preventDefault(); move(1); }
    else if (k === "ArrowLeft" || k === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); select(); }
    else if (k === "Escape" || k === "Backspace") { e.preventDefault(); back(); }
  });
  // Touch and mouse: each gesture is either a tap (select; a tapped row is
  // chosen first; an edge arrow moves) or a swipe (left/right/up move,
  // down goes back). Decided on release, so no tap is ever lost.
  let px = null, py = null;
  addEventListener("pointerdown", (e) => { px = e.clientX; py = e.clientY; });
  addEventListener("pointerup", (e) => {
    if (px == null) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = py = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 40) {
      if (Math.abs(dx) >= Math.abs(dy)) move(dx < 0 ? 1 : -1);
      else if (dy > 0) back();
      else move(1);
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest("#prev")) { move(-1); return; }
    if (target && target.closest("#next")) { move(1); return; }
    const li = target && target.closest("li[data-row]");
    if (li) row = Number(li.dataset.row);
    const chip = target && target.closest("[data-chip]");
    if (chip) syncRow = chip.dataset.chip === "yes" ? sync.chips.length : Number(chip.dataset.chip);
    select();
  });
  addEventListener("pointercancel", () => { px = py = null; });
  addEventListener("dblclick", (e) => e.preventDefault());

  // ------------------------------------------------------------ boot: her orb
  (async () => {
    await load();
    const left = await checkSync();
    if (!(await startBoot())) {
      show("home");
      if (left && (left.active || left.offer)) await startSync();  // left mid-way: back to it. Paused stays a card.
      else await startWelcome();
    }
    if (!demo) hudFetch();  // the feed's cursor: from now on
  })();
})();
