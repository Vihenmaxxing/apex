/* ==========================================
   APEX 5.0 — PLATFORM LAYER
   Two jobs, both small:

   1. Detect whether APEX is running inside a native Tauri window and adapt
      behaviour accordingly (safe areas, selection, storage durability).
   2. Provide a local backup file, so data can be moved between the browser,
      the Windows app and an iPhone without any account or online service.

   There is no cloud component here. Nothing leaves the device unless the
   user exports a file and moves it themselves.
   ========================================== */

/* ---------- Platform detection ---------- */
const APEX_PLATFORM = (function detectPlatform(){
  const isTauri = typeof window !== "undefined" &&
    (("__TAURI__" in window) || ("__TAURI_INTERNALS__" in window) ||
     /tauri\.localhost|^tauri:/.test(location.origin));
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWindows = /Windows NT/.test(ua);
  const isMac = /Macintosh/.test(ua) && !isIOS;
  const touch = navigator.maxTouchPoints > 0;
  return { isTauri, isIOS, isWindows, isMac, touch,
           name: isTauri ? (isIOS ? "ios" : isWindows ? "windows" : isMac ? "macos" : "native")
                         : "browser" };
})();
window.APEX_PLATFORM = APEX_PLATFORM;

document.documentElement.dataset.platform = APEX_PLATFORM.name;
if (APEX_PLATFORM.isTauri) document.body.classList.add("apex-native");
if (APEX_PLATFORM.touch) document.body.classList.add("apex-touch");

/* Ask the browser not to evict APEX's storage. Harmless where unsupported,
   and genuinely useful in a WKWebView under storage pressure. */
if (navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(already => already ? true : navigator.storage.persist())
    .catch(() => {});
}

/* A native window has no browser context menu to speak of; suppress it so a
   long-press on iOS does not pop a selection menu over the interface. */
if (APEX_PLATFORM.isTauri){
  document.addEventListener("contextmenu", event => {
    if (event.target.closest("input, textarea")) return;
    event.preventDefault();
  });
}

/* ---------- Backup ----------
   A single JSON file containing every APEX storage key plus the IndexedDB
   study records. This is what makes the data portable between platforms:
   the browser, the Windows app and the iOS app each have their own storage
   origin, so nothing transfers automatically. */
const APEX_BACKUP_KEYS = [
  "apexTasks", "apexSessions", "apexStudyRecords", "apexTimerState",
  "apexHabits", "apexHabitLogs", "apexQuoteLibrary", "apexDailyQuote",
  "apexEvents", "apexNotifyPrefs", "apexFitnessRecords", "apexWatch",
  "apexXPState", "apexXPLedger", "apexStadiumPrefs"
];

function apexBuildBackup(){
  const data = {};
  APEX_BACKUP_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) data[key] = raw;      // stored verbatim, so nothing is reshaped
  });
  return {
    format: "apex-backup",
    version: 1,
    app: "APEX 5.0",
    platform: APEX_PLATFORM.name,
    createdAt: new Date().toISOString(),
    localStorage: data,
    studyRecords: (typeof studyRecords !== "undefined" && Array.isArray(studyRecords))
      ? studyRecords.map(r => { const c = { ...r }; delete c.id; return c; })
      : []
  };
}

function apexExportBackup(){
  const payload = JSON.stringify(apexBuildBackup(), null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `apex-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/* Replace the IndexedDB study store with the records from a backup. */
function apexRestoreStudyRecords(records){
  return new Promise(resolve => {
    if (!window.indexedDB || !Array.isArray(records)) { resolve(false); return; }
    let request;
    try { request = indexedDB.open("APEXDB", 1); } catch { resolve(false); return; }
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("studyRecords"))
        db.createObjectStore("studyRecords", { keyPath: "id", autoIncrement: true });
    };
    request.onerror = () => resolve(false);
    request.onsuccess = event => {
      const db = event.target.result;
      let tx;
      try { tx = db.transaction("studyRecords", "readwrite"); } catch { resolve(false); return; }
      const store = tx.objectStore("studyRecords");
      store.clear();
      records.forEach(record => { const copy = { ...record }; delete copy.id; store.add(copy); });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    };
  });
}

async function apexImportBackup(file){
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, message: "That file is not valid JSON." }; }
  if (!parsed || parsed.format !== "apex-backup" || !parsed.localStorage)
    return { ok: false, message: "That is not an APEX backup file." };

  const keys = Object.keys(parsed.localStorage).filter(k => APEX_BACKUP_KEYS.includes(k));
  if (!keys.length) return { ok: false, message: "The backup contains no APEX data." };

  keys.forEach(key => {
    const value = parsed.localStorage[key];
    if (typeof value === "string") localStorage.setItem(key, value);
  });
  const studyCount = Array.isArray(parsed.studyRecords) ? parsed.studyRecords.length : 0;
  if (studyCount) await apexRestoreStudyRecords(parsed.studyRecords);

  return { ok: true, message: `Restored ${keys.length} data sets and ${studyCount} study records. Reloading…` };
}

/* ---------- Backup card, appended to the Progression page ---------- */
function renderBackupCard(){
  const root = document.getElementById("xpRoot");
  if (!root || typeof section !== "function") return;

  const card = section("APEX DATA");
  card.appendChild(el("p", "muted-small",
    `Running on: ${APEX_PLATFORM.name.toUpperCase()}. All data is stored on this device only — there is no account and nothing is uploaded. The browser, the Windows app and the iOS app each keep separate storage, so use a backup file to move your data between them.`));

  const actions = el("div", "apex-data-actions");
  actions.appendChild(btn("EXPORT BACKUP", "secondary", () => {
    try { apexExportBackup(); document.getElementById("apexDataMsg").textContent = "Backup file saved."; }
    catch (error){ document.getElementById("apexDataMsg").textContent = "Could not create the backup file."; }
  }));

  const label = el("label", "file-import", "IMPORT BACKUP");
  label.setAttribute("for", "apexImportFile");
  const input = document.createElement("input");
  input.type = "file"; input.id = "apexImportFile"; input.accept = ".json,application/json"; input.hidden = true;
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const message = document.getElementById("apexDataMsg");
    if (!confirm("Restoring a backup replaces the data currently on this device.\n\nContinue?")){
      input.value = ""; return;
    }
    message.textContent = "Restoring…";
    const result = await apexImportBackup(file);
    message.textContent = result.message;
    input.value = "";
    if (result.ok) setTimeout(() => location.reload(), 1200);
  });
  actions.append(label, input);
  card.appendChild(actions);

  const msg = el("p", "form-message", "");
  msg.id = "apexDataMsg"; msg.setAttribute("role", "status");
  card.appendChild(msg);
  root.appendChild(card);
}

/* The Progression page rebuilds itself on every open, so re-append after it. */
(function hookBackupCard(){
  if (typeof renderXPPage !== "function") return;
  const original = renderXPPage;
  window.renderXPPage = function patchedRenderXPPage(){
    original.apply(this, arguments);
    try { renderBackupCard(); } catch (error){ console.error("Backup card:", error); }
  };
})();

window.apexExportBackup = apexExportBackup;
window.apexImportBackup = apexImportBackup;
