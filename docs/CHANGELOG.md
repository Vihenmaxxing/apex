# APEX 5.0

Built on 4.7. Every existing module, storage key and record format is unchanged.

## Added

### Interactive Emirates Stadium
A new module reached from the **EMIRATES** tile on the home dashboard.

- An original SVG illustration built entirely in code — no image files, no
  external URLs, no network dependency. It renders identically in the browser,
  in a Tauri window and in a WKWebView.
- Two views of the same five sections:
  - **Three-quarter** — an isometric bowl with a raked three-tier seating deck,
    a mitred roof ring with trusses, an outer facade, floodlight pools on the
    turf, a ground shadow, and a marked pitch with mow stripes, centre circle,
    penalty areas and goals.
  - **Seating plan** — a top-down view, clearer on a phone, with the players'
    tunnel and dugouts marked on the west side where they actually are.
- Five interactive sections: North Bank, Clock End, East Stand, West Stand and
  the pitch. Each highlights in red, dims the others and opens a short factual
  description. Hover on a desktop, tap on a touchscreen, or tab and press Enter.
- A reset control, plus clicking a selected section again or clicking away.
- The chosen view persists across restarts in `apexStadiumPrefs`.
- With nothing selected the panel shows stadium facts: opened, capacity, pitch
  dimensions, tiers, stands, orientation.
- No club crest, badge, cannon or official typeface is reproduced. The artwork
  and lettering are original; the palette is red, white and dark tones.

### Cross-platform shell (Tauri 2)
- `src-tauri/` with a complete Tauri 2 configuration, validated against the
  official published config schema.
- A shared `lib.rs` entry point, so desktop and mobile run the same code path.
- A generated icon set: PNGs, a multi-resolution Windows `.ico`, a macOS
  `.icns` and the Windows Store logo sizes.
- Minimal capabilities — APEX needs no privileged APIs, so only `core:default`
  is granted. No plugins, no filesystem access, no network permissions.
- A content security policy that permits only the app's own files, plus the
  Google Fonts stylesheet.

### Cloud-first build workflow
- `.github/workflows/windows.yml` — Windows runner, produces an `.msi`, an
  NSIS setup `.exe` and a portable `.exe`.
- `.github/workflows/ios.yml` — macOS runner with Xcode, unsigned by default,
  signed `.ipa` when the four secrets are present.
- `.github/workflows/macos.yml` — universal `.dmg`.
- `.github/workflows/browser.yml` — runs the Playwright suites on every push,
  validates `tauri.conf.json` against the official schema, and runs a
  `cross-engine` matrix job on **WebKit and Firefox**. WebKit is the engine
  behind iOS WKWebView, so that job is the closest automated check on iOS
  rendering available without a device.
- All four cache the Rust build, so repeat runs take minutes rather than
  a quarter of an hour. Nothing needs installing locally.

### Mobile and touch adaptation (`mobile.css`)
- iOS safe-area handling via `env(safe-area-inset-*)` and `viewport-fit=cover`.
- 44px minimum touch targets, larger checkboxes, larger wheel rows.
- `touch-action: manipulation` on controls, removing the 300ms tap delay.
- Single-column layouts below 760px; wide content (habit table, calendar grid,
  tab strips) scrolls inside its own box rather than the page body.
- The HOME button becomes a sticky, full-width, thumb-reachable bar on phones.
- Inputs are forced to 16px in the native shell, which stops iOS zooming the
  viewport when a field is focused.
- A landscape-phone layout, and a wide-desktop layout that goes to three
  columns above 1600px.
- `prefers-reduced-motion` is respected throughout.

### Platform layer (`platform.js`)
- Detects whether APEX is running in a Tauri window and on which platform.
- Disables text selection, long-press callouts and rubber-band scrolling in
  the native shell while keeping inputs fully selectable.
- Requests `navigator.storage.persist()` so the OS is less likely to evict data.

### Local backup and restore
Progression → **APEX DATA**.

- Exports every APEX storage key plus the IndexedDB study records to one JSON
  file. Values are copied verbatim, so a restore reproduces the data exactly.
- Import validates the file, confirms before replacing anything, and reloads.
- This exists because the browser, the Windows app and the iOS app each have
  separate storage origins — see `docs/STORAGE.md`.
- No cloud component. Nothing leaves the device unless you move the file.

## Fixed

Three defects found by the new performance, accessibility and touch suites:

- Stadium sections did not carry `aria-pressed` until a selection had been
  made, so assistive technology would not have announced them as toggleable.
  Now set when each section is built.
- Row delete buttons (`×`) were only about 19px wide on a touchscreen. Buttons
  now have a 44px minimum width under coarse pointers.
- One of the tests was itself wrong: the reduced-motion check inspected
  `cssRules`, which `file://` blocks, giving a false negative. It now measures
  computed style under a reduced-motion context instead.

## Changed

- Font stacks now carry real fallbacks (`Arial Narrow`, `ui-monospace`,
  `system-ui` and so on) in 141 places, so APEX looks right offline and inside
  a native window where the Google Fonts stylesheet may not load. The import is
  the only external request in the entire application.
- The home module grid gains a sixth tile. The five original tiles keep their
  original order; nothing else on the home screen moved.
- Version strings updated to 5.0 in the title and header tag.

## Not changed

- The home screen layout, the dark dashboard aesthetic, the navigation system.
- Study, tasks, habits, fitness, analytics, the focus timer, the day planner,
  the watch system, the garage.
- The XP engine, the level curve, the integrity keys, the penalty rules.
- Every storage key and record shape. `apexStadiumPrefs` is additive and holds
  a single field.

## Project structure

The 4.7 application files moved from the project root into `src/`, so the web
app, the native shell and the CI configuration each have their own directory.
No file contents changed as a result. The untouched 4.7 release is kept at
`backup/APEX-4.7-original.zip`.
