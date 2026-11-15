# Storage: browser vs Tauri

## What APEX stores and where

Everything lives in the webview's own storage. There is no database server, no
account and no network call.

| Mechanism | Contents |
|---|---|
| `localStorage` | Tasks, habits and habit logs, fitness records, calendar events, quotes, timer state, watch settings, notification preferences, XP state and ledger, stadium view preference |
| `IndexedDB` (`APEXDB` → `studyRecords`) | Study records, with a `localStorage` fallback if IndexedDB is unavailable |

Storage keys are **unchanged from 4.7**. Nothing was renamed, migrated or
restructured for 5.0, so an existing browser install keeps all of its data.

| Key | Added |
|---|---|
| `apexTasks`, `apexSessions`, `apexStudyRecords`, `apexTimerState`, `apexHabits`, `apexHabitLogs`, `apexQuoteLibrary`, `apexDailyQuote`, `apexEvents`, `apexNotifyPrefs`, `apexFitnessRecords`, `apexWatch` | 4.6 and earlier |
| `apexXPState`, `apexXPLedger` | 4.7 |
| `apexStadiumPrefs` | 5.0 — stores one field, the chosen stadium view |

## Does Tauri change any of this?

No. Tauri does not replace browser storage; it hosts the same web platform APIs
in a native window. `localStorage` and `IndexedDB` work exactly as they do in a
browser, and APEX needs no Tauri storage plugin.

Where the data physically sits:

| Platform | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\com.apex.commandcentre\EBWebView\` |
| macOS | `~/Library/Application Support/com.apex.commandcentre/` |
| iOS | Inside the app's sandbox container |

These are keyed to the bundle identifier, so **installing an update preserves
user data**. Changing `identifier` in `tauri.conf.json` would orphan it — don't,
unless that is deliberate.

## The thing that actually catches people out

**Each platform has its own separate storage.** The browser, the Windows app
and the iOS app are different origins as far as the webview is concerned:

| Where APEX runs | Origin |
|---|---|
| Browser from disk | `file://` |
| Browser from a server | `http://localhost:8000` |
| Windows app | `http://tauri.localhost` |
| iOS / macOS app | `tauri://localhost` |

Data does **not** move between them automatically. Install the Windows app
after months of browser use and it starts empty — not because anything was
lost, but because it is looking in a different place.

Worth noting too: opening `src/index.html` directly and serving it over
`localhost` are *also* different origins. Pick one and stay with it, or use a
backup to move between them.

## Moving data between platforms

Progression → **APEX DATA** → **EXPORT BACKUP** writes a single JSON file
containing every APEX key plus the IndexedDB study records. **IMPORT BACKUP**
on the other device restores it.

The file is plain JSON, so it is readable and you can keep copies anywhere you
like. Storage values are copied verbatim rather than reshaped, so a restore
reproduces the original data exactly.

Import replaces what is on the device. It asks for confirmation first, rejects
anything that is not an APEX backup, and reloads once it is done.

There is deliberately **no cloud sync**. Backups move when you move them.

## Guarding against data loss

- `readStorage()` wraps every read in a try/catch and falls back to a default,
  so corrupted JSON cannot stop the app from loading.
- The XP engine rebuilds its total from the transaction ledger if the stored
  total is corrupted, and tolerates garbage, `null`, wrong types and missing
  keys. This is covered by tests in `docs/tests/test_edge.py`.
- `platform.js` requests `navigator.storage.persist()` so the operating system
  is less likely to evict APEX's data under pressure.
- "RESET XP ONLY" on the Progression page clears progression and nothing else.
  There is no control anywhere in APEX that wipes all user data.

A sensible habit: export a backup before installing a new version, and keep the
file somewhere other than the device it came from.
