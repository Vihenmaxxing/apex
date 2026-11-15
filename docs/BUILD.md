# Building APEX 5.0

Written for a laptop with little free disk space. The default path installs
nothing locally and builds everything on GitHub's runners.

---

## 0. What you actually need locally

| | Disk | Needed for |
|---|---|---|
| Git | ~50 MB | Pushing the repository |
| A browser | already installed | Running and testing the browser build |

That is the whole list. Rust is about 1.5 GB and Xcode is 15–40 GB — neither
goes on your machine unless you choose the local route in section 5.

---

## 1. Put the project in a private repository

```bash
cd "APEX 5.0"
git init
git add .
git commit -m "APEX 5.0"
git branch -M main
git remote add origin https://github.com/<you>/apex.git
git push -u origin main
```

Create the repository as **private**. `.gitignore` already excludes
`src-tauri/target/`, `src-tauri/gen/`, build artefacts and any signing
material, so only source is pushed — roughly 1 MB.

Check before pushing:

```bash
git count-objects -vH    # size-pack should be about 1 MB
git ls-files | wc -l     # around 40 files
```

---

## 2. Windows build

**Actions → Build Windows → Run workflow.**

Fifteen to twenty minutes the first time, two or three on later runs once the
Rust cache is warm. Three artifacts appear at the bottom of the run page:

| Artifact | What it is |
|---|---|
| `APEX-Windows-MSI` | `APEX_5.0.0_x64_en-GB.msi` — standard installer |
| `APEX-Windows-Setup` | `APEX_5.0.0_x64-setup.exe` — NSIS installer, per-user, no admin rights |
| `APEX-Windows-Portable` | `APEX.exe` — single file, no installation |

Download, unzip, run. Works on Windows 10 (1803 and later) and Windows 11.

### WebView2

Tauri uses Microsoft Edge WebView2 to render APEX. It ships with Windows 11 and
with up-to-date Windows 10. The installers are configured with
`downloadBootstrapper`, so if it is missing they fetch it silently on first
install. After that APEX runs fully offline.

### SmartScreen

The installers are unsigned, so Windows will show "Windows protected your PC"
on first run. Click **More info → Run anyway**. Removing that warning requires
a code-signing certificate, which costs money annually and is not set up here.
To add one later, put the certificate in repository secrets and set
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in
`windows.yml`.

---

## 3. iOS build

**Actions → Build iOS → Run workflow.**

Leave *signed* unticked for an unsigned compile. That proves the project builds
and catches breakage, but produces nothing installable.

For an app you can put on your iPhone, tick *signed* — this needs an Apple
Developer account and four repository secrets. `docs/IOS.md` covers all of it
step by step.

There is no way around the Apple account: iOS refuses unsigned applications,
and only Apple can issue the signing identity.

---

## 4. macOS build (optional)

**Actions → Build macOS → Run workflow.** Produces a universal `.dmg`.
Unsigned, so first launch needs right-click → Open, or
`xattr -cr /Applications/APEX.app`.

---

## 5. If you do want to build locally

Only worth it if you are changing Rust code, which APEX barely has.

### Shared prerequisite

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli --version "^2.0.0" --locked
```

About 1.5 GB for the toolchain, plus roughly 3 GB of build output in
`src-tauri/target/` per platform. `cargo clean` reclaims it.

### macOS → iOS

```bash
xcode-select --install
sudo xcodebuild -license accept
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
brew install cocoapods

cd "APEX 5.0"
cargo tauri ios init          # generates src-tauri/gen/apple
cargo tauri ios dev           # runs in the simulator
cargo tauri ios build         # builds the .ipa (signing required)
```

`cargo tauri ios init` writes an Xcode project into `src-tauri/gen/apple`. It is
generated output and is gitignored on purpose — regenerate it rather than
committing it.

### macOS → macOS

```bash
cargo tauri build --target universal-apple-darwin
```

### Windows → Windows

Install [Rust](https://rustup.rs) and the
[Visual Studio C++ build tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
(Desktop development with C++), then:

```powershell
cargo tauri build
```

**You cannot build the Windows app on macOS.** Tauri links against WebView2 and
the MSVC runtime; cross-compiling to Windows from macOS is not supported. Use
the Windows runner.

---

## 6. Live development

```bash
cd src && python3 -m http.server 8000
```

Edit files, refresh. The browser build is the source of truth — every platform
loads the same `src/` folder, so if it works in the browser it works in the
native shells. Only safe areas, touch targets and storage origins differ, and
those are handled in `mobile.css` and `platform.js`.

For the native window during development:

```bash
cargo tauri dev
```

---

## 7. Running the tests

```bash
pip install playwright
python -m playwright install chromium
python docs/tests/run_all.py
```

189 assertions across five suites. To check a different engine — WebKit is the
one that matters, since it is what iOS WKWebView uses:

```bash
python -m playwright install webkit
python docs/tests/test_engines.py webkit
```

All of this also runs automatically on every push through `browser.yml`, which
additionally validates `tauri.conf.json` against the official Tauri schema and
runs the WebKit and Firefox matrix.

---

## 8. Releasing an update

1. Bump the version in **both** `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`. They must match.
2. Commit and push.
3. Re-run the workflows and download the new artifacts.

Installing a new version over an old one keeps user data: the WebView2 and
WKWebView data directories are keyed to the bundle identifier
(`com.apex.commandcentre`), which does not change between versions. Do not
change the identifier unless you intend to orphan existing data.

---

## 9. Storing the builds

GitHub keeps artifacts for 90 days (30 for iOS) as configured. For anything
longer, tag a release and attach the installers to it — GitHub Releases has no
expiry, and it keeps the files off your laptop.
