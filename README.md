# APEX 5.0

A personal productivity command centre: study logging and analytics, a focus
timer, tasks, habits, fitness, a day planner, an XP and level progression
system, and an interactive illustration of Emirates Stadium.

Everything runs locally. There is no account, no server and no telemetry.

---

## What state this project is in

| Target | Status |
|---|---|
| **Browser** | **Built and tested.** 189 automated assertions pass in headless Chromium, covering function, performance under two years of data, accessibility and touch input. |
| **Windows** | **Configured, not built.** Complete Tauri config and a Windows CI workflow are included. No Windows machine was available, so no `.msi` has been produced or launched. |
| **iOS** | **Configured, not built.** Complete config and a macOS CI workflow are included. No macOS or Xcode was available, so no `.ipa` exists and nothing has run on a simulator or device. |
| **macOS** | **Configured, not built.** Same reason. |

The Windows and iOS applications are *ready to build* and the exact commands
are in `docs/BUILD.md`. They have **not** been compiled or run. Nothing in this
project claims otherwise. See `docs/TEST-REPORT.md` for the full breakdown of
what was and was not tested.

---

## Run it right now

Open `src/index.html` in any modern browser. That is the whole browser build —
no server, no build step, no install.

To rule out `file://` quirks, serve the folder instead:

```bash
cd src
python3 -m http.server 8000
# then open http://localhost:8000
```

A local server is also what you need for system notifications, which browsers
refuse to grant to pages opened straight from disk.

---

## Layout

```
APEX 5.0/
├── src/                    The application. This is the whole product.
│   ├── index.html          Markup and the page-switching navigation
│   ├── style.css           Core dark dashboard styles (from 4.6)
│   ├── stadium.css         Emirates Stadium styles
│   ├── mobile.css          Touch and safe-area adaptation, loaded last
│   ├── script.js           Tasks, timer, study, habits, fitness, planner, garage
│   ├── xp.js               XP engine and progression
│   ├── stadium.js          Emirates Stadium illustration and interaction
│   └── platform.js         Native detection and local backup/restore
├── src-tauri/              Native shell (Windows, iOS, macOS)
│   ├── tauri.conf.json     Validated against the official Tauri 2 schema
│   ├── Cargo.toml
│   ├── build.rs
│   ├── src/{main.rs,lib.rs}
│   ├── capabilities/default.json
│   └── icons/              Generated icon set, including .ico and .icns
├── .github/workflows/      Cloud builds — no local toolchain needed
│   ├── windows.yml         Windows runner → .msi, setup .exe, portable .exe
│   ├── ios.yml             macOS runner with Xcode → .ipa
│   ├── macos.yml           macOS runner → .dmg
│   └── browser.yml         Ubuntu runner → the Playwright suites
├── docs/
│   ├── BUILD.md            Cloud-first build workflow, start here
│   ├── IOS.md              Signing, provisioning, Apple Developer requirements
│   ├── STORAGE.md          Browser vs Tauri storage, and why backups matter
│   ├── TEST-REPORT.md      What passed, what was not run
│   ├── CHANGELOG.md        4.7 → 5.0
│   └── tests/              The Playwright suites (6 files, 189 assertions)
└── backup/
    └── APEX-4.7-original.zip   The untouched 4.7 release
```

---

## Building without filling up your laptop

The whole point of the CI workflows is that you never install Rust, Xcode or
the Windows SDK locally. Push the repository to GitHub, open the Actions tab,
run a workflow, download the artifact. A full walkthrough is in
`docs/BUILD.md`; the short version:

1. Create a **private** GitHub repository.
2. Push this folder to it.
3. Actions → **Build Windows** → *Run workflow*.
4. When it finishes, download the **APEX-Windows-MSI** artifact.

Local disk cost: the source is roughly 1 MB. Nothing else is needed.

---

## Your data

All of it stays on the device, in the webview's own storage. Storage keys are
unchanged from 4.7, so an existing browser install keeps every task, habit,
study record, fitness record, event, watch setting and all XP.

One thing worth knowing: **the browser, the Windows app and the iOS app each
have their own separate storage.** They are different origins as far as the
webview is concerned, so data does not move between them on its own. APEX
includes an export/import backup file for exactly this — Progression →
**APEX DATA**. `docs/STORAGE.md` explains it properly.

---

## Emirates Stadium

Home screen → **EMIRATES**.

Two views of the same five interactive sections — a three-quarter isometric
bowl and a top-down seating plan. Hover on a desktop, tap on a touchscreen, or
tab to a section and press Enter. Selecting North Bank, the Clock End, the East
Stand, the West Stand or the pitch highlights it, dims the rest and opens a
short factual description.

The artwork is drawn entirely as SVG in `stadium.js`: no image files, no
external URLs, no network. It contains no club crest, badge, cannon or official
typeface — the shapes and lettering are original, and the palette is simply
red, white and dark tones.

---

## Credits and scope

APEX is a personal project and is not affiliated with, endorsed by or connected
to Arsenal Football Club or Emirates. The stadium feature is an original
illustration made for personal use.
