# APEX 5.0 — test report

Two sections: what was actually executed, and what was not. The second section
matters more than the first.

---

# Part 1 — Tests that were run

**Environment:** headless Chromium via Playwright, on Linux x86_64.
**Suites:** `docs/tests/` — reproducible with `python docs/tests/run_all.py`.
**Result: 189 assertions, 189 passed, 0 failed.**

| Suite | Assertions | Covers |
|---|---:|---|
| `test_xp.py` | 42 | XP awards, duplicate prevention, level curve, persistence, ledger |
| `test_data.py` | 39 | 4.6/4.7 data preservation, migration, every existing module, home layout |
| `test_edge.py` | 30 | Penalties, daily caps, corruption recovery, focus timer, XP reset |
| `test_stadium.py` | 40 | Stadium structure, interaction, views, regressions, backup |
| `test_platform.py` | 38 | Large-dataset performance, accessibility, real touch input, orientation |

A sixth suite, `test_engines.py`, runs the same smoke checks against any
engine. It passed on Chromium here (34 assertions). WebKit and Firefox could
not be installed in this environment — see Part 2.

## Browser build — existing modules

Verified against a realistic v4.6-shaped dataset written to storage and reloaded:

- `apexSessions`, `apexHabits`, `apexHabitLogs`, `apexFitnessRecords`
  (including a v4.1 legacy record with no `kind`), `apexEvents`,
  `apexQuoteLibrary`, `apexNotifyPrefs` and `apexWatch` all returned
  byte-identical after the upgrade.
- Task text and completed state preserved exactly; migration added ids and day
  stamps without altering anything else.
- Habit week table, habit analytics (four cards), habit management list.
- Calendar grid renders; a saved event appears under UPCOMING.
- All five fitness tabs render; the v4.1 legacy record is still listed.
- Study analytics — all four charts plus the heatmap.
- Focus timer wheels build; saved duration restores correctly.
- Daily quote renders from an imported library.
- Garage canvas initialises; watch slot renders a saved watch.
- Navigation: all eight pages open, with exactly one visible at a time.
- Home screen order unchanged; the five original tiles keep their order.

## Browser build — XP and progression

- Task 15 XP, habit 10 XP, 30 min study 20 XP, 45 min study 30 XP (pro-rata),
  chapter 40 XP, milestone 75 XP, strength 25 XP, rest day 5 XP.
- Toggling a task six times and a habit four times awarded nothing further.
- Logging the same chapter twice paid the study time but not the chapter bonus.
- Level curve confirmed at `[0, 100, 250, 450, 700, 2700]`; 99 XP is Level 1,
  100 XP is exactly Level 2; level-up notification fires.
- Total XP, level and the home strip survive a reload.
- Daily study cap measured across 7 hours logged in one day: 160 / 20 / 20 / 0
  XP, with all four records still saved in full and analytics showing `7h 0m`.
- A third training session in a day paid 0 but was logged normally.
- Penalties hit missed days, skipped a logged rest day and skipped today, did
  not repeat on reload, and floored total XP at 0.
- Corrupted XP state (garbage JSON, wrong types, `null`, negative totals,
  missing keys) all recovered; a corrupted total rebuilt from the ledger.
- The one-time legacy credit computed 200 XP from seeded data, appeared once,
  and did not repeat.
- "RESET XP ONLY" cleared progression and left tasks and habits intact.

## Browser build — Emirates Stadium

- Tile present on the home dashboard with its miniature artwork drawn.
- Illustration builds to 198 SVG nodes; contains no `http(s)` references of any
  kind, confirming it needs no network.
- All five sections present in **both** views.
- Each of the five, clicked: correct name shown, description of meaningful
  length, correct section highlighted, others dimmed.
- Clicking a selected section deselects it; clicking away clears; the reset
  button clears; with nothing selected the panel shows the facts grid.
- Keyboard: focus a section and press Enter — selects correctly.
- View switching works both ways and the preference persists across a reload.
- Rendered and visually inspected at 1440px and at 390×844.

## Browser build — backup

- Export produces a correctly tagged `apex-backup` v1 payload containing the
  APEX keys.
- Import accepts its own export and reports what it restored.
- Import rejects a non-APEX JSON file with a clear message.

## Browser build — performance with a large dataset

Seeded with two years of data and reloaded: 3,893 habit logs across 8 habits,
600 study records in IndexedDB, 400 tasks, 500 fitness records, 200 calendar
events.

- Cold boot with the full dataset: **0.68s**.
- Every page rendered in well under a second: habits 0.23s, study 0.26s,
  fitness 0.16s, calendar 0.13s, progression 0.13s, stadium 0.08s, tasks 0.11s,
  home 0.13s.
- All 3,893 habit logs and all 600 study records retained; analytics computed
  over the complete set.
- No console or page errors at any point.

XP ledger growth: 800 awards written in one go. The ledger trims to its
400-entry cap as designed, and the running total survived the trim intact —
no XP is lost when old transactions are discarded.

## Browser build — accessibility

- All five stadium sections are focusable, carry accessible names, and expose
  `aria-pressed` from the moment they are built.
- The illustration itself has `role="img"` and a label.
- Every visible button has text or an `aria-label`.
- Status messages use live regions; the page declares its language.
- `prefers-reduced-motion` verified **behaviourally**: transition duration
  drops from 0.18s to effectively zero when the preference is set.

## Browser build — touch input

Run in an emulated iPhone 13 context with a real touchscreen, using genuine
tap events rather than synthetic clicks:

- Tap opens the stadium page, selects a section, switches view and returns home.
- Tap adds a task, completes it and awards XP.
- Every visible button measures at least 44×44.
- The task checkbox stays visually small but its row is 75px tall and the label
  toggles the identical state, so there is an equivalent large target.
- No horizontal overflow in portrait, in landscape, or on return to portrait.
- The stadium remains usable in landscape.

## Issues found by these tests and fixed

Three real defects, all now fixed and re-verified:

1. **Stadium sections did not expose `aria-pressed` until something had been
   selected.** A screen reader would not have announced them as toggleable.
   Now set at build time in all four construction sites.
2. **Row delete buttons were only ~19px wide** on touch — tall enough, but
   awkward to hit. `min-width: 44px` added for coarse pointers.
3. **A test itself was wrong.** The reduced-motion check read `cssRules`, which
   `file://` blocks for security, producing a false negative. Rewritten to
   measure computed style under a reduced-motion context, which is a better
   test regardless.

## Static checks

- `node --check` passes on all four JavaScript files.
- `tauri.conf.json` validates against the **official Tauri 2 config schema**,
  fetched from the Tauri repository. Zero errors.
- `Cargo.toml` parses as valid TOML.
- `capabilities/default.json` parses as valid JSON.
- All four GitHub Actions workflows parse as valid YAML with correct runners.
- No console errors or page errors in any suite, on any page.
- No horizontal overflow at 1440px or 390px.

---

# Part 2 — Tests that were NOT run

This environment is Linux x86_64 with **no Rust toolchain, no WebKit
development headers, no Windows machine, and no macOS or Xcode**. Tauri cannot
be compiled here at all, and even if it could, a Linux host cannot produce
Windows or iOS binaries.

So the following were **not done**, and nothing in this project should be read
as claiming otherwise.

## Windows — not built, not launched

Not done:

- `cargo tauri build` was never executed.
- No `.msi`, no setup `.exe`, no portable `.exe` exists.
- APEX has never been launched in a native Windows window.
- Navigation, modules, saving and reopening, offline behaviour and the stadium
  interactions have never been exercised on Windows.
- The WebView2 bootstrapper path is untested.
- SmartScreen behaviour is expected but unverified.

What *is* done: a schema-valid configuration and a CI workflow that should
produce all three artifacts. Run it per `docs/BUILD.md` §2.

**Check first on Windows:** that the window opens at a sensible size on a
Windows 10 laptop; that data survives closing and reopening; that the app works
with networking disabled; and that the Google Fonts stylesheet failing offline
degrades to the fallback stack cleanly rather than looking broken.

## iOS — not built, no simulator, no device

Not done:

- `cargo tauri ios init` was never run, so `src-tauri/gen/apple` does not exist.
- No Xcode project, no `.ipa`.
- Nothing has run on a simulator or a physical iPhone.
- Touch interactions, responsive layout, safe areas and local persistence are
  **unverified on the actual platform**. They were tested in a 390×844 Chromium
  viewport with touch emulation, which is not the same thing.
- Signing and provisioning have not been performed.

The mobile layout work is real and tested in an emulated viewport. Whether it
behaves correctly against a genuine notch, a genuine home indicator and
WKWebView's quirks is unknown until someone builds it.

`docs/IOS.md` lists the specific platform differences most likely to need
attention — the background focus timer, notifications falling back to in-app
toasts, the garage canvas frame rate, and storage durability under WKWebView.

## macOS — not built

Same reason. The workflow exists; it has never been run.

## Other engines — not run here, wired into CI

WebKit is the engine behind Safari and behind iOS WKWebView, so running APEX
on it is the closest automated proxy for iOS rendering short of a device.

It could **not** be installed in this environment: the Playwright browser
download host is outside the sandbox's network allowlist, and only Chromium was
already cached. Firefox is unavailable for the same reason.

So `test_engines.py` was written to be engine-agnostic and a `cross-engine`
matrix job was added to `.github/workflows/browser.yml`. It installs WebKit and
Firefox and runs the suite on both, on every push. That job has **never been
executed** — GitHub Actions has not been run at all. The suite itself is known
to work, having passed on Chromium here.

Running it is the single cheapest thing that would de-risk the iOS target.

## Not covered anywhere

- Long-term storage durability. Nothing has been running for days or weeks.
- Real system notifications. Tested only as in-app toasts.
- Screen readers. ARIA structure is verified programmatically, but no
  VoiceOver, NVDA or JAWS session has taken place.
- Real Safari, real Edge, real Firefox. Only Chromium, plus the CI job above
  which has not been run.
- Printing, high-contrast mode, and display scaling above 100%.

---

# Summary

The browser build is tested thoroughly on Chromium — 189 assertions across
five suites, covering function, performance under two years of data,
accessibility and real touch input. Three genuine defects were found by that
testing and fixed.

The Windows, iOS and macOS targets are **configured and ready to build, but
unbuilt and untested**. The first genuine test of any native target will be the
first time one of those workflows is run.
