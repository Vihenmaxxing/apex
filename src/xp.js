/* ==========================================
   APEX XP — unified progression system (v4.7)
   Additive only. Reads existing modules, writes two new localStorage keys:
     apexXPState   { v, totalXP, settings, awarded{key:ts}, seeded }
     apexXPLedger  [ {id, key, amount, reason, source, at} ]
   No existing key, record or store is modified by this file.
   ========================================== */

/* ---------- 1. CENTRAL CONFIGURATION ----------
   Every XP value in APEX is set here and nowhere else. */
const APEX_XP = {
  version: 1,

  /* Reward values */
  values: {
    habit: 10,              // one habit, one day
    task: 15,               // one task, completed once
    studyPer30Min: 20,      // pro-rata, so 45 min = 30 XP
    focusSession: 10,       // protecting a timed session (separate from logging it)
    chapter: 40,            // a chapter finished, once per subject + chapter
    milestone: 75,          // a major target reached, once ever
    fitness: { strength: 25, endurance: 25, football: 30, other: 20, rest: 5 }
  },

  /* Balance — keeps effort honest and stops grinding paying off */
  balance: {
    studyFullRateMinutes: 240,  // full XP for the first 4 h logged on a date
    studyHalfRateMinutes: 360,  // half XP from 4–6 h, nothing beyond 6 h
    fitnessPerDay: 2,           // 3rd+ session on one date earns 0 XP
    legacyBonusCap: 5000        // ceiling on the one-time credit for past work
  },

  /* Missed work costs a little. Rest is never punished. */
  penalties: {
    enabled: true,
    missedHabit: 5,
    missedTask: 5,
    maxPerDay: 15,
    lookbackDays: 7
  },

  /* Level curve: XP for level n -> n+1 is base + step*(n-1) */
  levels: {
    base: 100,
    step: 50,
    titles: [[30,"APEX"],[20,"ELITE"],[15,"VETERAN"],[10,"SPECIALIST"],[5,"OPERATOR"],[1,"ROOKIE"]]
  },

  /* Major targets. Each pays values.milestone, once ever. */
  milestones: [
    { id:"study-10h",   label:"10 hours of study logged",    test:s => s.studyMinutes >= 600 },
    { id:"study-50h",   label:"50 hours of study logged",    test:s => s.studyMinutes >= 3000 },
    { id:"study-100h",  label:"100 hours of study logged",   test:s => s.studyMinutes >= 6000 },
    { id:"chapters-10", label:"10 chapters finished",        test:s => s.chapters >= 10 },
    { id:"chapters-30", label:"30 chapters finished",        test:s => s.chapters >= 30 },
    { id:"tasks-25",    label:"25 tasks completed",          test:s => s.tasksDone >= 25 },
    { id:"tasks-100",   label:"100 tasks completed",         test:s => s.tasksDone >= 100 },
    { id:"habit-7",     label:"A habit held for 7 days",     test:s => s.bestHabitStreak >= 7 },
    { id:"habit-30",    label:"A habit held for 30 days",    test:s => s.bestHabitStreak >= 30 },
    { id:"focus-25",    label:"25 focus sessions protected", test:s => s.focusSessions >= 25 },
    { id:"fitness-25",  label:"25 training sessions logged", test:s => s.fitnessSessions >= 25 },
    { id:"fitness-100", label:"100 training sessions logged",test:s => s.fitnessSessions >= 100 }
  ]
};

/* Existing modules declare their state with `let`, so it lives in the global lexical
   scope and NOT on window (window.studyRecords is in fact the DOM element of that id).
   These accessors read the real bindings safely. */
const xpRef = {
  tasks:        () => (typeof tasks        !== "undefined" && Array.isArray(tasks))        ? tasks        : [],
  studyRecords: () => (typeof studyRecords !== "undefined" && Array.isArray(studyRecords)) ? studyRecords : [],
  fit:          () => (typeof fit          !== "undefined" && Array.isArray(fit))          ? fit          : [],
  habitLogs:    () => (typeof habitLogs    !== "undefined" && Array.isArray(habitLogs))    ? habitLogs    : [],
  habits:       () => (typeof habits       !== "undefined" && Array.isArray(habits))       ? habits       : [],
  sessions:     () => (typeof sessions     !== "undefined" && Number.isFinite(sessions))   ? sessions     : 0
};

/* ---------- 2. STATE ---------- */
const XP_STATE_KEY = "apexXPState", XP_LEDGER_KEY = "apexXPLedger", XP_LEDGER_MAX = 400;

function xpBlankState(){
  return { v: APEX_XP.version, totalXP: 0, settings: { penalties: APEX_XP.penalties.enabled }, awarded: {}, seeded: false };
}
function xpLoadState(){
  const raw = readStorage(XP_STATE_KEY, null);
  const s = xpBlankState();
  if (!raw || typeof raw !== "object") return s;
  if (Number.isFinite(Number(raw.totalXP))) s.totalXP = Math.max(0, Math.round(Number(raw.totalXP)));
  if (raw.awarded && typeof raw.awarded === "object" && !Array.isArray(raw.awarded)) s.awarded = raw.awarded;
  if (raw.settings && typeof raw.settings === "object") s.settings.penalties = raw.settings.penalties !== false;
  s.seeded = raw.seeded === true;
  return s;
}
function xpLoadLedger(){
  const raw = readStorage(XP_LEDGER_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(t => t && typeof t.key === "string" && Number.isFinite(Number(t.amount)));
}
let xpState = xpLoadState(), xpLedger = xpLoadLedger();

/* Corrupted or missing total: rebuild it from the ledger rather than losing progress. */
(function repairXPTotal(){
  if (!xpLedger.length) return;
  const ledgerSum = xpLedger.reduce((a, t) => a + Number(t.amount || 0), 0);
  const trimmed = xpLedger.length >= XP_LEDGER_MAX;
  if (!trimmed && xpState.totalXP === 0 && ledgerSum > 0) xpState.totalXP = Math.max(0, ledgerSum);
})();

const xpSaveState  = () => writeStorage(XP_STATE_KEY, xpState);
const xpSaveLedger = () => writeStorage(XP_LEDGER_KEY, xpLedger.slice(-XP_LEDGER_MAX));

/* ---------- 3. LEVELS ---------- */
function xpForLevelStep(level){ return APEX_XP.levels.base + APEX_XP.levels.step * (level - 1); }
function xpTotalForLevel(level){            // cumulative XP needed to BE this level
  let total = 0;
  for (let n = 1; n < level; n++) total += xpForLevelStep(n);
  return total;
}
function xpProgress(total = xpState.totalXP){
  const safe = Math.max(0, Number(total) || 0);
  let level = 1, floor = 0;
  while (level < 999 && safe >= floor + xpForLevelStep(level)) { floor += xpForLevelStep(level); level++; }
  const need = xpForLevelStep(level), into = safe - floor;
  return { level, into, need, floor, remaining: need - into, pct: Math.max(0, Math.min(100, Math.round(into / need * 100))), total: safe };
}
function xpLevelTitle(level){
  const found = APEX_XP.levels.titles.find(([min]) => level >= min);
  return found ? found[1] : "ROOKIE";
}

/* ---------- 4. AWARDING — one key, one award, ever ---------- */
function xpHasKey(key){ return Object.prototype.hasOwnProperty.call(xpState.awarded, key); }

/* Returns the XP actually granted. 0 means "already counted" or "nothing earned". */
function xpAward(key, amount, reason, source, opts = {}){
  const value = Math.round(Number(amount) || 0);
  if (!key || xpHasKey(key)) return 0;                 // duplicate guard
  if (value === 0 && !opts.recordZero) { xpState.awarded[key] = Date.now(); xpSaveState(); return 0; }

  const before = xpProgress().level;
  xpState.awarded[key] = Date.now();
  xpState.totalXP = Math.max(0, xpState.totalXP + value);
  xpLedger.push({ id: "xp-" + Date.now() + "-" + Math.random().toString(16).slice(2),
                  key, amount: value, reason: String(reason || "XP"), source: String(source || "other"),
                  at: new Date().toISOString() });
  xpSaveState(); xpSaveLedger();

  const after = xpProgress();
  if (!opts.silent && value > 0) xpToast(value, reason);
  if (after.level > before) xpLevelUp(after.level);
  xpRenderAll();
  return value;
}

/* Penalties share the same one-key-one-write guarantee. Total never goes below zero. */
function xpPenalise(key, amount, reason, source){
  if (!xpState.settings.penalties) return 0;
  const value = Math.round(Number(amount) || 0);
  if (!key || xpHasKey(key) || value <= 0) return 0;
  const taken = Math.min(value, xpState.totalXP);
  xpState.awarded[key] = Date.now();
  xpState.totalXP = Math.max(0, xpState.totalXP - taken);
  if (taken > 0){
    xpLedger.push({ id: "xp-" + Date.now() + "-" + Math.random().toString(16).slice(2),
                    key, amount: -taken, reason: String(reason), source: String(source || "missed"),
                    at: new Date().toISOString() });
    xpSaveLedger();
  }
  xpSaveState();
  return taken;
}

function xpToast(amount, reason){
  if (typeof toast === "function") toast(`+${amount} XP`, reason, "study");
}
function xpLevelUp(level){
  const title = xpLevelTitle(level);
  if (typeof apexNotify === "function") apexNotify(`Level ${level} reached`, `${title} · keep the work steady.`, "study");
  else if (typeof toast === "function") toast(`Level ${level} reached`, title, "study");
}

/* ---------- 5. HOOKS — called from the existing modules ---------- */
function xpDateKey(d){ return typeof localDateKey === "function" ? localDateKey(d) : new Date().toISOString().slice(0,10); }

/* Study minutes already logged on a date, excluding the record just saved. */
function xpStudyValue(record){
  const mins = Math.max(0, Number(record && record.minutes) || 0);
  if (!mins) return 0;
  const all = xpRef.studyRecords();
  let before = all.filter(r => r.date === record.date).reduce((s, r) => s + (Number(r.minutes) || 0), 0) - mins;
  if (!Number.isFinite(before) || before < 0) before = 0;

  const rate = APEX_XP.values.studyPer30Min / 30;
  const { studyFullRateMinutes: full, studyHalfRateMinutes: half } = APEX_XP.balance;
  let cursor = before, left = mins, xp = 0;
  const band = (limit, multiplier) => {
    if (left <= 0) return;
    const use = Math.min(left, Math.max(0, limit - cursor));
    xp += use * rate * multiplier; cursor += use; left -= use;
  };
  band(full, 1); band(half, 0.5);       // anything past studyHalfRateMinutes earns nothing
  return Math.round(xp);
}
function xpNormalise(text){ return String(text || "").trim().toLowerCase().replace(/\s+/g, " "); }

const APEXXP = {
  /* A task moved from incomplete to complete. */
  task(task){
    if (!task || !task.id) return 0;
    return xpAward("task:" + task.id, APEX_XP.values.task, "Task completed", "task");
  },
  /* A habit checked off for one specific day. */
  habit(habitId, dateKey, habitName){
    if (!habitId || !dateKey) return 0;
    return xpAward(`habit:${habitId}:${dateKey}`, APEX_XP.values.habit,
                   `Habit: ${habitName || "completed"}`, "habit");
  },
  /* A study record saved. Uses the record's own storage id. */
  study(record){
    if (!record || record.id === undefined || record.id === null) return 0;
    const value = xpStudyValue(record);
    const reason = value > 0
      ? `Study: ${record.subject} · ${record.minutes} min`
      : `Study logged (daily XP cap reached) · ${record.minutes} min`;
    return xpAward("study:" + record.id, value, reason, "study", { recordZero: value === 0 });
  },
  /* The "chapter finished" box ticked in the study logger. Once per subject + chapter. */
  chapter(subject, chapter){
    const key = `chapter:${xpNormalise(subject)}::${xpNormalise(chapter)}`;
    if (!xpNormalise(chapter)) return 0;
    return xpAward(key, APEX_XP.values.chapter, `Chapter finished: ${chapter}`, "chapter");
  },
  /* A fitness record saved. Rest days earn a little; they are never penalised. */
  fitness(record){
    if (!record || !record.id) return 0;
    const kind = APEX_XP.values.fitness[record.kind] !== undefined ? record.kind : "other";
    let value = APEX_XP.values.fitness[kind];
    if (kind !== "rest"){
      const sameDay = xpRef.fit()
        .filter(r => r.date === record.date && r.kind !== "rest" && r.id !== record.id).length;
      if (sameDay >= APEX_XP.balance.fitnessPerDay) value = 0;   // no reward for over-training
    }
    const label = { strength:"Strength session", endurance:"Endurance session", football:"Football session",
                    other:"Training session", rest:"Rest day logged" }[kind];
    return xpAward("fitness:" + record.id, value,
                   value > 0 ? label : `${label} (daily XP cap reached)`, "fitness",
                   { recordZero: value === 0 });
  },
  /* The focus timer ran to zero. Rewards the protected session itself. */
  focusSession(minutes){
    const key = "focus:" + Date.now();
    return xpAward(key, APEX_XP.values.focusSession,
                   `Focus session protected${minutes ? " · " + minutes + " min" : ""}`, "focus");
  },
  checkMilestones(){ xpCheckMilestones(); },
  refresh(){ xpRenderAll(); },
  config: APEX_XP,
  progress: () => xpProgress()
};
window.APEXXP = APEXXP;

/* ---------- 6. MILESTONES ---------- */
function xpBestHabitStreak(){
  const logs = xpRef.habitLogs();
  const byHabit = {};
  logs.filter(l => l && l.completed).forEach(l => (byHabit[l.habitId] = byHabit[l.habitId] || []).push(l.date));
  let best = 0;
  Object.values(byHabit).forEach(dates => {
    const sorted = [...new Set(dates)].sort();
    let run = 0, prev = null;
    sorted.forEach(d => {
      if (prev){
        const gap = Math.round((new Date(d + "T12:00") - new Date(prev + "T12:00")) / 86400000);
        run = gap === 1 ? run + 1 : 1;
      } else run = 1;
      prev = d; if (run > best) best = run;
    });
  });
  return best;
}
function xpSnapshot(){
  const study = xpRef.studyRecords(), taskList = xpRef.tasks(), fitList = xpRef.fit();
  return {
    studyMinutes: study.reduce((s, r) => s + (Number(r.minutes) || 0), 0),
    chapters: Object.keys(xpState.awarded).filter(k => k.startsWith("chapter:")).length,
    tasksDone: taskList.filter(t => t && t.completed).length,
    bestHabitStreak: xpBestHabitStreak(),
    focusSessions: xpRef.sessions(),
    fitnessSessions: fitList.filter(r => r.kind !== "rest").length
  };
}
function xpCheckMilestones(){
  const snap = xpSnapshot();
  APEX_XP.milestones.forEach(m => {
    const key = "milestone:" + m.id;
    if (xpHasKey(key)) return;
    let hit = false; try { hit = !!m.test(snap); } catch { hit = false; }
    if (hit) xpAward(key, APEX_XP.values.milestone, "Target reached: " + m.label, "milestone");
  });
}

/* ---------- 7. ONE-TIME CREDIT FOR WORK DONE BEFORE THE XP SYSTEM EXISTED ----------
   Runs once. Recorded as a single capped transaction, so it can never repeat. */
function xpSeedLegacy(){
  if (xpState.seeded || xpHasKey("seed:legacy")) { xpState.seeded = true; xpSaveState(); return; }
  const study = xpRef.studyRecords(), taskList = xpRef.tasks(), fitList = xpRef.fit(), logs = xpRef.habitLogs();

  const studyMinutes = study.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
  let total = Math.round(studyMinutes * (APEX_XP.values.studyPer30Min / 30));
  total += taskList.filter(t => t && t.completed).length * APEX_XP.values.task;
  total += logs.filter(l => l && l.completed).length * APEX_XP.values.habit;
  fitList.forEach(r => {
    const kind = APEX_XP.values.fitness[r.kind] !== undefined ? r.kind : "other";
    total += APEX_XP.values.fitness[kind];
  });
  total += xpRef.sessions() * APEX_XP.values.focusSession;
  total = Math.min(total, APEX_XP.balance.legacyBonusCap);

  /* Mark every past completion as counted so nothing can be awarded twice later. */
  taskList.forEach(t => { if (t && t.id && t.completed) xpState.awarded["task:" + t.id] = Date.now(); });
  logs.forEach(l => { if (l && l.completed) xpState.awarded[`habit:${l.habitId}:${l.date}`] = Date.now(); });
  study.forEach(r => { if (r && r.id !== undefined) xpState.awarded["study:" + r.id] = Date.now(); });
  fitList.forEach(r => { if (r && r.id) xpState.awarded["fitness:" + r.id] = Date.now(); });

  xpState.seeded = true;
  if (total > 0){
    xpAward("seed:legacy", total, "Credit for work logged before XP existed", "legacy", { silent: true });
  } else {
    xpState.awarded["seed:legacy"] = Date.now();
    xpSaveState();
  }
}

/* ---------- 8. MISSED WORK ----------
   Habits and tasks that were missed cost a little. A logged rest day protects the
   whole day, and fitness is never penalised at all. Capped, and switchable off. */
function xpApplyPenalties(){
  if (!xpState.settings.penalties) return;
  const today = xpDateKey();
  const fitList = xpRef.fit();
  const restDays = new Set(fitList.filter(r => r.kind === "rest").map(r => r.date));
  const live = typeof liveHabits === "function" ? liveHabits() : [];
  let lost = 0, count = 0;

  for (let i = 1; i <= APEX_XP.penalties.lookbackDays; i++){
    const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - i);
    const key = xpDateKey(d);
    if (key >= today) continue;
    if (restDays.has(key)) continue;                       // rest is never punished
    let dayLost = 0;
    for (const h of live){
      if (dayLost >= APEX_XP.penalties.maxPerDay) break;
      const isTracked = typeof tracked === "function" ? tracked(h, key) : false;
      const done = typeof isDone === "function" ? isDone(h.id, key) : true;
      if (!isTracked || done) continue;
      const taken = xpPenalise(`miss:habit:${h.id}:${key}`, APEX_XP.penalties.missedHabit,
                               `Missed habit: ${h.name} (${key})`, "missed");
      if (taken > 0){ dayLost += taken; lost += taken; count++; }
    }
  }

  /* A task still open after the day it was added counts as missed, once. */
  const taskList = xpRef.tasks();
  let taskLost = 0;
  taskList.forEach(t => {
    if (!t || !t.id || t.completed || !t.day || t.day >= today) return;
    if (taskLost >= APEX_XP.penalties.maxPerDay) return;
    const taken = xpPenalise("miss:task:" + t.id, APEX_XP.penalties.missedTask,
                             `Task not finished: ${t.text}`, "missed");
    if (taken > 0){ taskLost += taken; lost += taken; count++; }
  });

  if (lost > 0 && typeof toast === "function"){
    toast(`−${lost} XP`, `${count} missed ${count === 1 ? "item" : "items"} · rest days are never counted`, "other");
  }
  if (lost > 0) xpRenderAll();
}

/* ---------- 9. INTERFACE ---------- */
function xpSourceLabel(source){
  return { task:"TASK", habit:"HABIT", study:"STUDY", chapter:"CHAPTER", fitness:"FITNESS",
           focus:"FOCUS", milestone:"TARGET", legacy:"HISTORY", missed:"MISSED" }[source] || "XP";
}
function xpTodayTotal(){
  const today = xpDateKey();
  return xpLedger.filter(t => String(t.at).slice(0,10) === today).reduce((s, t) => s + Number(t.amount || 0), 0);
}

/* Home strip — compact by design, so the home screen stays uncluttered. */
function xpRenderHomeStrip(){
  const box = document.getElementById("xpHomeStrip");
  if (!box) return;
  const p = xpProgress();
  box.replaceChildren();
  const badge = el("div", "xp-badge");
  badge.append(el("small", "", "LEVEL"), el("strong", "", String(p.level)));
  const mid = el("div", "xp-strip-mid");
  const top = el("div", "xp-strip-top");
  top.append(el("span", "xp-title", xpLevelTitle(p.level)),
             el("span", "xp-total", `${p.total.toLocaleString("en-IN")} XP`));
  const track = el("div", "xp-track"), fill = el("div", "xp-fill");
  fill.style.width = p.pct + "%"; track.appendChild(fill);
  const foot = el("div", "xp-strip-foot");
  const todayXP = xpTodayTotal();
  foot.append(el("span", "", `${p.into} / ${p.need} TO LEVEL ${p.level + 1}`),
              el("span", "", todayXP >= 0 ? `+${todayXP} TODAY` : `${todayXP} TODAY`));
  mid.append(top, track, foot);
  const open = btn("VIEW", "secondary xp-strip-open", () => window.apexOpenPage && window.apexOpenPage("progression"));
  box.append(badge, mid, open);
}

function xpRenderLedger(host, limit){
  const list = [...xpLedger].reverse().slice(0, limit || 60);
  if (!list.length){ host.appendChild(el("p", "empty-state", "No XP yet. Complete a task, habit or study session to begin.")); return; }
  let currentDay = "";
  list.forEach(t => {
    const day = String(t.at).slice(0,10);
    if (day !== currentDay){
      currentDay = day;
      host.appendChild(el("p", "xp-ledger-day", day === xpDateKey() ? "TODAY" : day));
    }
    const row = el("div", "xp-txn" + (t.amount < 0 ? " is-loss" : ""));
    const left = el("div", "xp-txn-copy");
    left.append(el("strong", "", t.reason), el("small", "", xpSourceLabel(t.source) + " · " +
      new Date(t.at).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:false })));
    row.append(left, el("span", "xp-txn-amount", (t.amount >= 0 ? "+" : "") + t.amount + " XP"));
    host.appendChild(row);
  });
}

function renderXPPage(){
  const root = document.getElementById("xpRoot");
  if (!root) return;
  root.replaceChildren();
  const p = xpProgress();

  /* Headline card */
  const head = el("div", "card xp-hero");
  const ring = el("div", "xp-hero-badge");
  ring.append(el("small", "", "LEVEL"), el("strong", "", String(p.level)), el("span", "", xpLevelTitle(p.level)));
  const info = el("div", "xp-hero-info");
  info.appendChild(el("h3", "", "APEX PROGRESSION"));
  const track = el("div", "xp-track xp-track-lg"), fill = el("div", "xp-fill");
  fill.style.width = p.pct + "%"; track.appendChild(fill);
  info.append(el("p", "xp-hero-total", `${p.total.toLocaleString("en-IN")} XP TOTAL`), track,
    el("p", "muted-small", `${p.into} / ${p.need} XP towards Level ${p.level + 1} · ${p.remaining} to go`));
  head.append(ring, info);
  root.appendChild(head);

  /* Stat row */
  const snap = xpSnapshot(), today = xpTodayTotal();
  const week = xpLedger.filter(t => {
    const d = new Date(t.at); return (Date.now() - d.getTime()) < 7 * 86400000;
  }).reduce((s, t) => s + Number(t.amount || 0), 0);
  const stats = el("div", "stats-grid");
  stats.append(statCard("XP TODAY", (today >= 0 ? "+" : "") + today),
               statCard("XP THIS WEEK", (week >= 0 ? "+" : "") + week),
               statCard("TRANSACTIONS", xpLedger.length),
               statCard("TARGETS HIT", `${APEX_XP.milestones.filter(m => xpHasKey("milestone:" + m.id)).length}/${APEX_XP.milestones.length}`));
  root.appendChild(stats);

  /* Where XP came from */
  const split = section("WHERE YOUR XP CAME FROM");
  const totals = {};
  xpLedger.forEach(t => { if (t.amount > 0) totals[t.source] = (totals[t.source] || 0) + t.amount; });
  const entries = Object.entries(totals).sort((a,b) => b[1] - a[1]);
  if (!entries.length) split.appendChild(el("p", "empty-state", "Nothing earned yet."));
  else {
    const max = Math.max(...entries.map(e => e[1]));
    entries.forEach(([src, value]) => {
      const row = el("div", "chart-row"), tr = el("div", "chart-track"), fl = el("div", "chart-fill");
      fl.style.width = (value / max * 100) + "%"; tr.appendChild(fl);
      row.append(el("span", "chart-name", xpSourceLabel(src)), tr, el("span", "chart-value", value + " XP"));
      split.appendChild(row);
    });
  }

  /* Milestones */
  const mile = section("MAJOR TARGETS");
  mile.appendChild(el("p", "muted-small", `Each target pays ${APEX_XP.values.milestone} XP, once.`));
  const grid = el("div", "xp-milestones");
  APEX_XP.milestones.forEach(m => {
    const done = xpHasKey("milestone:" + m.id);
    const card = el("div", "xp-milestone" + (done ? " is-done" : ""));
    card.append(el("i", "xp-mile-mark", done ? "✓" : "○"), el("span", "", m.label));
    grid.appendChild(card);
  });
  mile.appendChild(grid);

  const two = el("div", "xp-two-col"); two.append(split, mile); root.appendChild(two);

  /* Reward table */
  const rates = section("HOW XP IS EARNED");
  const table = el("div", "xp-rates");
  [["Complete a habit", APEX_XP.values.habit + " XP"],
   ["Complete a task", APEX_XP.values.task + " XP"],
   ["Study, per 30 minutes logged", APEX_XP.values.studyPer30Min + " XP"],
   ["Focus timer run to zero", APEX_XP.values.focusSession + " XP"],
   ["Finish a chapter", APEX_XP.values.chapter + " XP"],
   ["Reach a major target", APEX_XP.values.milestone + " XP"],
   ["Strength / endurance session", APEX_XP.values.fitness.strength + " XP"],
   ["Football session", APEX_XP.values.fitness.football + " XP"],
   ["Other sport", APEX_XP.values.fitness.other + " XP"],
   ["Rest day logged", APEX_XP.values.fitness.rest + " XP"]
  ].forEach(([label, value]) => {
    const row = el("div", "xp-rate-row"); row.append(el("span", "", label), el("strong", "", value)); table.appendChild(row);
  });
  rates.appendChild(table);
  rates.append(
    el("p", "muted-small", `Study earns full XP for the first ${APEX_XP.balance.studyFullRateMinutes / 60} hours logged on a date, half XP up to ${APEX_XP.balance.studyHalfRateMinutes / 60} hours, and nothing beyond that. Training earns XP for the first ${APEX_XP.balance.fitnessPerDay} sessions a day. Long days are logged in full — they just stop paying.`),
    el("p", "muted-small", `Levels: Level 1 starts at 0 XP. Each level costs ${APEX_XP.levels.base} XP plus ${APEX_XP.levels.step} XP more than the one before, so Level 2 is ${xpTotalForLevel(2)} XP, Level 5 is ${xpTotalForLevel(5)} XP and Level 10 is ${xpTotalForLevel(10)} XP.`)
  );
  root.appendChild(rates);

  /* Settings */
  const settings = section("XP SETTINGS");
  const toggleRow = el("label", "cal-check");
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!xpState.settings.penalties;
  cb.addEventListener("change", () => { xpState.settings.penalties = cb.checked; xpSaveState(); renderXPPage(); });
  toggleRow.append(cb, document.createTextNode(" Subtract XP for missed habits and unfinished tasks"));
  settings.append(toggleRow,
    el("p", "muted-small", `Missed habits and tasks cost ${APEX_XP.penalties.missedHabit} XP each, up to ${APEX_XP.penalties.maxPerDay} XP a day, looking back ${APEX_XP.penalties.lookbackDays} days. A logged rest day protects that whole day, and fitness is never penalised.`));
  settings.appendChild(btn("RESET XP ONLY", "record-delete", () => {
    if (!confirm("Reset your level, XP and transaction history?\n\nTasks, habits, study records, fitness records and events are NOT touched.")) return;
    xpState = xpBlankState(); xpState.seeded = true; xpLedger = [];
    xpSaveState(); xpSaveLedger(); renderXPPage(); xpRenderHomeStrip();
  }));
  root.appendChild(settings);

  /* History */
  const hist = section("XP TRANSACTION HISTORY");
  xpRenderLedger(hist, 120);
  root.appendChild(hist);
}

function xpRenderAll(){
  xpRenderHomeStrip();
  const page = document.querySelector('[data-page-section="progression"]');
  if (page && !page.hidden) renderXPPage();
}

/* ---------- 10. STARTUP ----------
   Study records load asynchronously from IndexedDB, so the legacy credit and the
   milestone sweep wait for them. xpStudyReady() is called by script.js when ready. */
let xpBooted = false;
function xpBoot(){
  if (xpBooted) return;
  xpBooted = true;
  xpSeedLegacy();
  xpApplyPenalties();
  xpCheckMilestones();
  xpRenderAll();
}
window.xpStudyReady = xpBoot;
setTimeout(xpBoot, 2500);   // fallback if IndexedDB never settles
xpRenderHomeStrip();
