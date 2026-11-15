# iOS: signing, provisioning and getting APEX onto an iPhone

> **Status:** the iOS project is fully configured but has **not** been built.
> No `.ipa` exists, and nothing has been run on a simulator or a device.
> Everything below is the procedure, not a report of work done.

---

## The constraint, plainly

Apple will not run an unsigned application on an iPhone. Signing requires an
Apple ID enrolled in some form of developer programme, and the signing identity
can only be issued by Apple. There is no technical workaround, and no amount of
configuration in this repository changes it.

What this does buy you: once the account exists, the whole build still happens
on a GitHub macOS runner, so Xcode never touches your laptop.

---

## Which account you need

| | Free Apple ID | Apple Developer Program |
|---|---|---|
| Cost | Free | 99 USD / year |
| Install on your own iPhone | Yes | Yes |
| App expires after | **7 days**, then reinstall | 1 year |
| Devices | 1 device, 3 apps at a time | 100 devices |
| TestFlight / App Store | No | Yes |
| Build on a CI runner | Awkward — needs Xcode signed in | Yes, with exported certificates |

For personal use on one phone, the free Apple ID works, but you reinstall every
seven days and it is easiest from Xcode on a Mac rather than from CI.

For anything beyond that — a stable install, sharing with anyone else,
TestFlight, the App Store — you need the paid programme.

---

## Route A — free Apple ID, from a Mac

Needs Xcode locally (15–40 GB), so this conflicts with the low-disk goal. Use
it only if you have a Mac with room.

```bash
cargo tauri ios init
open src-tauri/gen/apple/apex.xcodeproj
```

In Xcode:

1. **Xcode → Settings → Accounts**, add your Apple ID.
2. Select the **apex_iOS** target → **Signing & Capabilities**.
3. Tick **Automatically manage signing**.
4. Set **Team** to your personal team (`Your Name (Personal Team)`).
5. Change the **Bundle Identifier** to something unique to you, for example
   `com.yourname.apex`. The default `com.apex.commandcentre` may already be
   taken on Apple's side.
6. Plug in the iPhone, select it as the run destination, press **Run**.
7. On the phone: **Settings → General → VPN & Device Management → Developer
   App → Trust**.

The app stops launching after seven days. Rebuild from Xcode to reset it.

Simulator only, no signing needed:

```bash
cargo tauri ios dev
```

---

## Route B — paid programme, built on CI

This is the route the `ios.yml` workflow is written for, and the one that keeps
your laptop empty.

### 1. Enrol

<https://developer.apple.com/programs/enroll/> — 99 USD per year. Approval
usually takes 24–48 hours.

### 2. Register the iPhone

Find its UDID: connect it to a Mac and read it in Finder, or in Xcode under
**Window → Devices and Simulators**.

Then **Certificates, Identifiers & Profiles → Devices → +**, and add it.

### 3. Create an App ID

**Identifiers → + → App IDs → App.** Use the same bundle identifier as
`tauri.conf.json`:

```
com.apex.commandcentre
```

If you change it there, change it in `tauri.conf.json` too — they must match
exactly or the build fails at signing.

No capabilities need enabling. APEX uses no push notifications, no iCloud, no
HealthKit and no network entitlements.

### 4. Create a distribution certificate

1. On a Mac: **Keychain Access → Certificate Assistant → Request a Certificate
   From a Certificate Authority**, save the `.certSigningRequest` to disk.
2. **Certificates → + → Apple Distribution**, upload the request, download the
   resulting `.cer`.
3. Double-click the `.cer` to install it into Keychain.
4. In Keychain, find the certificate, expand it, select both the certificate
   **and** its private key, right-click → **Export 2 items**, save as `.p12`
   and set a password.

### 5. Create an Ad Hoc provisioning profile

**Profiles → + → Ad Hoc**, pick the App ID, pick the certificate, tick your
registered device, download the `.mobileprovision`.

Ad Hoc installs on registered devices. Use **App Store** distribution instead
if you are going to TestFlight.

### 6. Add four repository secrets

GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `IOS_CERTIFICATE_P12` | `base64 -i cert.p12 \| pbcopy` |
| `IOS_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE` | `base64 -i profile.mobileprovision \| pbcopy` |
| `APPLE_TEAM_ID` | Ten characters, top right of the developer portal |

On Linux, `base64 -w 0 cert.p12` instead.

Never commit these files. `.gitignore` already blocks `*.p12`, `*.cer` and
`*.mobileprovision`.

### 7. Build

**Actions → Build iOS → Run workflow**, tick **signed**. Download the
`APEX-iOS` artifact — it contains the `.ipa`.

### 8. Install on the phone

- **Apple Configurator** (free, Mac) — drag the `.ipa` onto the device.
- **TestFlight** — upload the `.ipa` via Transporter, then install from the
  TestFlight app. Needs App Store distribution signing rather than Ad Hoc.
- **Xcode → Devices and Simulators → Installed Apps → +**.

---

## What still needs doing before the App Store

Not required for personal use, listed so there are no surprises:

- A privacy policy URL. APEX collects nothing and transmits nothing, which
  makes the policy short, but App Store Connect requires one.
- App Privacy answers: "Data Not Collected" throughout.
- Screenshots at the required device sizes.
- A 1024×1024 icon without transparency or rounded corners. The generated
  `src-tauri/icons/icon.png` is 1024×1024 but has an alpha channel — flatten it
  onto an opaque background first.
- Export compliance: APEX uses no encryption beyond standard platform HTTPS, so
  the usual exemption applies.
- **Intellectual property review is the real risk here.** The Emirates Stadium
  feature uses original artwork and no club marks, but App Review takes a
  conservative view of anything referencing a real club or venue. For personal
  or TestFlight use this does not arise. If you intend to publish, either get
  permission or rename and re-theme the feature generically.

---

## Known platform differences to check once it runs

None of these have been verified, because nothing has been run. They are the
things most likely to need attention first:

- **Safe areas.** `mobile.css` uses `env(safe-area-inset-*)` and the viewport
  is set to `viewport-fit=cover`. Confirm the header clears the notch and the
  toasts clear the home indicator.
- **Input zoom.** Inputs are forced to 16px under `.apex-native` to stop iOS
  zooming on focus. Confirm it holds on every form.
- **The focus timer in the background.** iOS suspends webviews aggressively.
  The timer stores an absolute `endTime` and recalculates on resume, so it
  should survive, but the completion notification will not fire while
  suspended. Worth testing properly.
- **Notifications.** The day planner uses the web Notification API, which
  WKWebView does not support. On iOS, alerts fall back to the in-app toast and
  chime. Making them real system notifications means adding
  `tauri-plugin-notification`.
- **The garage canvas.** The 360° car renderer is software-rasterised in
  JavaScript. Check the frame rate on an actual phone; if it drags, pause the
  auto-spin when the page is not visible.
- **Storage durability.** WKWebView can evict storage under pressure.
  `platform.js` calls `navigator.storage.persist()`, but confirm the data
  survives a reboot and a few days of disuse before trusting it.
