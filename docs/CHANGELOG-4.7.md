# APEX v4.7 — XP & Progression

Built on v4.6. Every existing module, storage key and record format is unchanged.

## How to run

Extract the folder and open `index.html` in a browser. No server, no build step,
no internet connection needed. (Serving the folder over `http://localhost` is only
required if you want *system* notifications — on-screen alerts and sound work either way.)

Files: `index.html`, `style.css`, `script.js`, `xp.js` (new).

---

## Added

**`xp.js` — the XP engine.** A new file holding the whole progression system. Every
tunable value lives in one `APEX_XP` object at the top of it; nothing else in the
codebase needs touching to rebalance XP.

**XP is earned across every module:**

| Activity | XP |
|---|---:|
| Complete a habit | 10 |
| Complete a task | 15 |
| Study, per 30 minutes logged | 20 (pro-rata — 45 min = 30 XP) |
| Focus timer run to zero | 10 |
| Finish a chapter | 40 |
| Reach a major target | 75 |
| Strength / endurance session | 25 |
| Football session | 30 |
| Other sport | 20 |
| Rest day logged | 5 |

**Levels.** Level 1 starts at 0 XP. Level *n* → *n*+1 costs `100 + 50 × (n−1)` XP,
so Level 2 is at 100 XP, Level 3 at 250, Level 5 at 700, Level 10 at 2,700. Base and
step are configurable. Level titles run ROOKIE → OPERATOR → SPECIALIST → VETERAN →
ELITE → APEX.

**Interface:**
- A slim XP strip on the home screen: level badge, title, total XP, progress bar,
  XP remaining to the next level, XP earned today. One row, 108px tall — the home
  screen layout is otherwise untouched.
- A sixth home tile, **PROGRESSION** (this also tidies the module grid from an
  awkward 5 tiles into a clean 3×2).
- A new **Progression** page: level card, XP today/this week, source breakdown,
  12 major targets, the full earning table, settings, and transaction history.
- Toasts on every award, reusing the existing APEX alert system, plus a level-up
  notification.
- A **"I finished this chapter"** checkbox in the study logger — there was no
  existing chapter-completion action to hook into.

**12 major targets** (75 XP each, once ever): study hour milestones, chapters
finished, tasks completed, habit streaks, focus sessions, training sessions.

---

## XP integrity

One rule: **one key, one award, ever.** Each award is keyed on a stable identifier,
and awarded keys persist in storage:

| Source | Key |
|---|---|
| Task | `task:<task id>` |
| Habit | `habit:<habit id>:<date>` |
| Study record | `study:<record id>` |
| Chapter | `chapter:<subject>::<chapter>` (case and spacing normalised) |
| Fitness | `fitness:<record id>` |
| Target | `milestone:<id>` |

Consequences, all verified by test:
- Un-ticking and re-ticking a task or habit awards nothing further.
- Refreshing the browser never re-awards anything.
- Logging the same chapter twice pays the study time but not the chapter bonus again.
- Deleting a record leaves earned XP intact (earned is earned); editing a task's text
  keeps its id, so nothing re-fires.

**Tasks gained a stable id.** They were previously stored as `{text, completed}` with
nothing to key an award on. Existing tasks are migrated in place: text and completed
state are preserved exactly, and each gains an `id` plus a `day` stamp set to today
(so pre-existing tasks are never counted as "missed").

---

## Balance

Effort is rewarded; grinding is not.

- Study earns full XP for the first 4 hours logged on a date, half XP from 4–6 hours,
  and nothing beyond 6. Long days are still **logged in full and appear in analytics**
  — they just stop paying XP.
- Training earns XP for the first 2 sessions a day. A third is logged normally, worth 0 XP.
- Rest days earn +5 XP. Recovery is credited, never punished.
- The focus timer and the study logger reward different things (protecting the session
  vs. recording the work), so the same minutes are never paid twice at full rate.

## Missed work

Missed habits and unfinished tasks cost 5 XP each, capped at 15 XP a day, looking back
7 days. Each miss is keyed like an award, so it is only ever counted once.

- A logged **rest day protects that entire day** — no habit penalties at all.
- Fitness is **never** penalised.
- Today is never penalised.
- Total XP floors at 0 and can never go negative.
- The whole thing can be switched off on the Progression page.
- Misses are reported in a single summary toast rather than a stream of them.

---

## Data safety

- **Two new keys only:** `apexXPState` and `apexXPLedger`. No existing key, record,
  object store or IndexedDB schema is modified.
- **One-time credit for past work.** On first run, XP is calculated from existing
  study, task, habit, fitness and session data and granted as a single capped
  (5,000 XP) transaction keyed `seed:legacy`. Every historical completion is
  simultaneously marked as counted, so nothing can pay twice later. Verified not to
  repeat across reloads.
- **Corruption is handled.** Garbage JSON, wrong types, `null`, negative totals and
  missing keys all recover to a working state. A corrupted total is rebuilt by
  summing the transaction ledger.
- The ledger is capped at 400 entries. The running total is stored separately, so
  trimming old history never loses XP.
- **Reset XP only** wipes level, XP and history and touches nothing else.

---

## Bugs fixed (both pre-existing in v4.6)

1. **Focus timer restored as `00:00:00`.** After a session finished, reloading left
   the timer displaying zero instead of the chosen duration. The study page is
   `display:none` at load, so the picker wheels can't be scrolled into position and
   the restore silently failed. It now falls back to the saved selection, so the
   display always matches the wheels.
2. **Football summary showed `MAIN POSITION: undefined`** for records saved without
   a position. Now shows `Unrecorded`.

## A note on the brief

Section 6 contained the line *"Sometimes, encourage unhealthy study schedules or
excessive exercise"*, which reads as a truncated negative — it sits directly beneath
"do NOT punish rest days", in an app whose habits page says *"Track the work, not your
worth."* It has been implemented as **never** encouraging unhealthy schedules, which
is what the daily study and training caps above are for. Say the word if a different
behaviour was intended.

## Not built (per section 9)

APXGP, APX FC, shared game economies, APEX Credits and game integrations were
excluded deliberately. The `Prompts/` folder describing them was left untouched.
APEX remains a standalone productivity application.
