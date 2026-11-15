/* ==========================================
   APEX — STUDY COMMAND CENTRE + APEX LIFE
   Version 4.6 — module tile colours aligned; APEX Garage 360° car viewer,
   preset watch dials and hand styles, planner card row
   4.3 — iPhone-style countdown on the watch, day planner + event alerts
   Existing storage keys and APEXDB are preserved.
   ========================================== */

const STORAGE_KEYS = {
    tasks: "apexTasks", sessions: "apexSessions",
    study: "apexStudyRecords", timer: "apexTimerState",
    habits: "apexHabits", habitLogs: "apexHabitLogs",
    quotes: "apexQuoteLibrary", dailyQuote: "apexDailyQuote",
    events: "apexEvents", notify: "apexNotifyPrefs"
};
var watchReady = false;
function readStorage(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; }
    catch { return fallback; }
}
function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.error("Storage error:", error); return false; }
}
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function formatStudyTime(minutes) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${h}h ${m}m`;
}

/* 1. TASK MANAGER */
let tasks = readStorage(STORAGE_KEYS.tasks, []);
if (!Array.isArray(tasks)) tasks = [];
tasks = tasks.filter(t => t && typeof t.text === "string");
/* XP migration: every task needs a stable identifier so XP can be awarded exactly once.
   Existing tasks keep their text and completed state; they only gain an id and a day
   stamp. The day stamp is set to today so older tasks are never counted as missed. */
(function migrateTaskIds(){
    let changed = false;
    const today = localDateKey();
    tasks.forEach(t => {
        if (!t.id) { t.id = "task-" + Date.now() + "-" + Math.random().toString(16).slice(2); changed = true; }
        if (!t.day) { t.day = today; changed = true; }
    });
    if (changed) writeStorage(STORAGE_KEYS.tasks, tasks);
})();
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
function saveTasks() { writeStorage(STORAGE_KEYS.tasks, tasks); }
function updateTaskProgress() {
    const total = tasks.length, completed = tasks.filter(t => t.completed).length;
    const pct = total ? Math.round(completed / total * 100) : 0;
    document.getElementById("progressNumber").textContent = pct + "%";
    document.getElementById("taskProgress").style.width = pct + "%";
    document.getElementById("progressText").textContent = `${completed} of ${total} tasks completed`;
}
function renderTasks() {
    taskList.replaceChildren();
    tasks.forEach((task, index) => {
        const li = el("li", task.completed ? "completed" : "");
        const box = document.createElement("input"); box.type = "checkbox"; box.checked = !!task.completed; box.setAttribute("aria-label", "Complete task");
        box.addEventListener("change", () => { setTaskCompleted(index, box.checked); });
        const label = el("span", "task-label", task.text);
        label.addEventListener("click", () => { setTaskCompleted(index, !tasks[index].completed); });
        const edit = el("button", "task-edit", "EDIT"); edit.type = "button";
        edit.addEventListener("click", () => { const t = prompt("Edit task:", task.text); if (t === null || !t.trim()) return; tasks[index].text = t.trim(); saveTasks(); renderTasks(); });
        const del = el("button", "record-delete", "×"); del.type = "button";
        del.addEventListener("click", () => { tasks.splice(index, 1); saveTasks(); renderTasks(); });
        const acts = el("div", "task-row-actions"); acts.append(edit, del);
        li.append(box, label, acts); taskList.appendChild(li);
    });
    updateTaskProgress();
}
/* Single place where a task changes state, so XP is awarded from exactly one path.
   Re-ticking a task that was already counted awards nothing — the XP engine keys
   the award on the task id, so toggling cannot generate XP more than once. */
function setTaskCompleted(index, completed) {
    const task = tasks[index]; if (!task) return;
    const wasCompleted = !!task.completed;
    task.completed = !!completed;
    saveTasks(); renderTasks();
    if (task.completed && !wasCompleted && window.APEXXP) {
        window.APEXXP.task(task);
        window.APEXXP.checkMilestones();
    }
}
function addTask() {
    const text = taskInput.value.trim(); if (!text) return;
    tasks.push({ id: "task-" + Date.now() + "-" + Math.random().toString(16).slice(2),
                 text, completed: false, day: localDateKey() });
    saveTasks(); taskInput.value = ""; renderTasks();
}
document.getElementById("addTaskButton").addEventListener("click", addTask);
taskInput.addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
renderTasks();

/* 2. FOCUS TIMER — PERSISTENT */
const hoursWheel = document.getElementById("hoursWheel"), minutesWheel = document.getElementById("minutesWheel"), secondsWheel = document.getElementById("secondsWheel");
const timerDisplay = document.getElementById("timerDisplay"), timerProgress = document.getElementById("timerProgress"), timerMessage = document.getElementById("timerMessage"), timerPicker = document.getElementById("timerPicker");
const startButton = document.getElementById("startButton"), resetButton = document.getElementById("resetButton"), sessionCountElement = document.getElementById("sessionCount");
const ITEM_HEIGHT = 44;
let lastPick = {h:0,m:45,s:0}, syncingWheels = false;
let timerRunning = false, timerInterval = null, endTime = 0, remainingTime = 45*60*1000, totalDuration = remainingTime;
let sessions = Number(readStorage(STORAGE_KEYS.sessions, 0)) || 0;
sessionCountElement.textContent = sessions;
function pick() { if (timerPicker.style.display !== "none" && hoursWheel.offsetParent !== null) lastPick = {h:getWheelValue(hoursWheel), m:getWheelValue(minutesWheel), s:getWheelValue(secondsWheel)}; return lastPick; }
function syncWheels() { syncingWheels = true; [[hoursWheel,lastPick.h],[minutesWheel,lastPick.m],[secondsWheel,lastPick.s]].forEach(([w,v]) => { w.scrollTop = v*ITEM_HEIGHT; updateWheelSelection(w); }); setTimeout(() => { syncingWheels = false; }, 400); }
function getWheelValue(node) { return Math.max(0, Math.round(node.scrollTop / ITEM_HEIGHT)); }
function getSelectedDuration() { const p = pick(); return (p.h*3600 + p.m*60 + p.s)*1000; }
function saveTimerState() {
    writeStorage(STORAGE_KEYS.timer, { running: timerRunning, remainingTime, totalDuration, endTime,
        selectedHours:pick().h, selectedMinutes:pick().m, selectedSeconds:pick().s });
}
function updateWheelSelection(node) {
    const selected = getWheelValue(node);
    node.querySelectorAll(".wheel-option").forEach(o => o.classList.toggle("selected", Number(o.dataset.value) === selected));
}
function buildWheel(node, max, initial) {
    node.replaceChildren();
    for (let i=0;i<=max;i++) { const option=el("div","wheel-option",String(i).padStart(2,"0")); option.dataset.value=i; node.appendChild(option); }
    node.scrollTop=initial*ITEM_HEIGHT; updateWheelSelection(node);
    node.addEventListener("scroll", () => {
        updateWheelSelection(node);
        if (!timerRunning && !syncingWheels) { clearTimeout(node.scrollTimeout); node.scrollTimeout=setTimeout(setTimerFromWheels,120); }
    });
    node.addEventListener("click", event => {
        const option=event.target.closest(".wheel-option"); if (!option) return;
        node.scrollTo({top:Number(option.dataset.value)*ITEM_HEIGHT,behavior:"smooth"});
    });
}
function formatTime(ms) {
    const total=Math.max(0,Math.ceil(ms/1000)), h=Math.floor(total/3600), m=Math.floor(total%3600/60), s=total%60;
    return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
}
function renderTimer() {
    timerDisplay.textContent=formatTime(remainingTime);
    const pct=totalDuration>0 ? (totalDuration-remainingTime)/totalDuration*100 : 0;
    timerProgress.style.width=Math.max(0,Math.min(100,pct))+"%";
    updateTimerFace();
}
/* iPhone-style countdown face: depleting ring, large tabular readout, finish time. */
const RING_RADIUS=54, RING_LENGTH=2*Math.PI*RING_RADIUS;
function timerActive(){ return timerRunning || (remainingTime>0 && remainingTime<totalDuration); }
function formatClock(ms){
    const total=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),sec=total%60;
    return h ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}
function clockAfter(ms){ return new Date(Date.now()+ms).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:false}); }
function timerFraction(){ return totalDuration>0 ? Math.max(0,Math.min(1,remainingTime/totalDuration)) : 0; }
function timerTone(){ return !timerRunning ? "paused" : remainingTime<=60000 ? "warning" : "running"; }
function updateTimerFace(){
    const ring=document.getElementById("timerRing"); if(!ring) return;
    const active=timerActive(),bar=document.getElementById("timerBar");
    ring.hidden=!active; timerDisplay.hidden=active; if(bar) bar.hidden=active;
    timerPicker.style.display=active?"none":"block";
    if(active){
        const progress=document.getElementById("ringProgress");
        progress.style.strokeDasharray=RING_LENGTH;
        progress.style.strokeDashoffset=String(RING_LENGTH*(1-timerFraction()));
        document.getElementById("ringTime").textContent=formatClock(remainingTime);
        document.getElementById("ringEnd").textContent=timerRunning?"ENDS "+clockAfter(remainingTime):"PAUSED";
        const tone=timerTone();
        ring.classList.toggle("is-paused",tone==="paused");
        ring.classList.toggle("is-warning",tone==="warning");
    }
    if(watchReady) syncWatchTimer();
}
function stopTimerInterval() { if(timerInterval!==null){clearInterval(timerInterval);timerInterval=null;} }
function setTimerFromWheels() { if(timerRunning)return; remainingTime=getSelectedDuration();totalDuration=remainingTime;renderTimer();saveTimerState(); }
function finishTimer() {
    stopTimerInterval(); timerRunning=false; remainingTime=0; endTime=0;
    sessions++;writeStorage(STORAGE_KEYS.sessions,sessions);sessionCountElement.textContent=sessions;
    startButton.textContent="START";timerPicker.style.display="block";timerMessage.textContent="Session complete. Well done. Duration pre-filled in the study logger below.";{const sd=document.getElementById("studyDuration");if(sd&&totalDuration)sd.value=Math.max(1,Math.round(totalDuration/60000));}renderTimer();saveTimerState();
    if(typeof apexNotify==="function") apexNotify("Focus session complete","Nicely done. The duration is pre-filled in the study logger.","study");
    /* XP for protecting the session itself. The minutes are rewarded separately,
       and only once, when the study record is actually saved below. */
    if(window.APEXXP){window.APEXXP.focusSession(Math.round(totalDuration/60000));window.APEXXP.checkMilestones();}
}
function startTimer() {
    if(remainingTime<=0){remainingTime=getSelectedDuration();totalDuration=remainingTime;}
    if(remainingTime<=0){timerMessage.textContent="Choose a duration first.";return;}
    timerRunning=true;endTime=Date.now()+remainingTime;timerPicker.style.display="none";startButton.textContent="PAUSE";timerMessage.textContent="Stay focused.";saveTimerState();stopTimerInterval();renderTimer();
    timerInterval=setInterval(()=>{remainingTime=Math.max(0,endTime-Date.now());renderTimer();if(remainingTime<=0)finishTimer();},250);
}
function pauseTimer() {
    remainingTime=Math.max(0,endTime-Date.now());stopTimerInterval();timerRunning=false;endTime=0;
    timerPicker.style.display="block";startButton.textContent="RESUME";timerMessage.textContent="Timer paused.";renderTimer();saveTimerState();
}
function resetTimer() {
    stopTimerInterval();timerRunning=false;endTime=0;remainingTime=getSelectedDuration();totalDuration=remainingTime;
    timerPicker.style.display="block";startButton.textContent="START";timerMessage.textContent="Ready when you are.";renderTimer();saveTimerState();
}
function restoreTimerState() {
    const saved=readStorage(STORAGE_KEYS.timer,null);if(!saved)return;
    const h=Math.min(23,Math.max(0,Number(saved.selectedHours)||0)),m=Math.min(59,Math.max(0,Number(saved.selectedMinutes)||0)),s=Math.min(59,Math.max(0,Number(saved.selectedSeconds)||0));
    hoursWheel.scrollTop=h*ITEM_HEIGHT;minutesWheel.scrollTop=m*ITEM_HEIGHT;secondsWheel.scrollTop=s*ITEM_HEIGHT;
    [hoursWheel,minutesWheel,secondsWheel].forEach(updateWheelSelection);lastPick={h,m,s};
    totalDuration=Math.max(0,Number(saved.totalDuration)||0);remainingTime=Math.max(0,Number(saved.remainingTime)||0);
    if(saved.running&&Number(saved.endTime)>0){remainingTime=Math.max(0,Number(saved.endTime)-Date.now());if(remainingTime<=0){finishTimer();return;}timerRunning=false;startTimer();return;}
    timerRunning=false;endTime=0;timerPicker.style.display="block";
    /* Fix: the study page is display:none at load, so the wheels cannot be scrolled
       into position yet and a finished timer restored as 00:00:00. Fall back to the
       saved selection so the display always matches the wheels. */
    if(remainingTime<=0){remainingTime=(h*3600+m*60+s)*1000;totalDuration=remainingTime;}
    startButton.textContent=remainingTime>0&&remainingTime<totalDuration?"RESUME":"START";timerMessage.textContent="Timer restored.";renderTimer();
}
startButton.addEventListener("click",()=>timerRunning?pauseTimer():startTimer());resetButton.addEventListener("click",resetTimer);
buildWheel(hoursWheel,23,0);buildWheel(minutesWheel,59,45);buildWheel(secondsWheel,59,0);restoreTimerState();renderTimer();

/* 3. STUDY DATABASE — KEEP EXISTING DATABASE AND STORE */
let studyDB=null,studyRecords=[],studyStorageMode="indexeddb";
function openStudyDatabase(){return new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error("IndexedDB unavailable"));return;}const req=indexedDB.open("APEXDB",1);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains("studyRecords"))db.createObjectStore("studyRecords",{keyPath:"id",autoIncrement:true});};req.onsuccess=e=>resolve(e.target.result);req.onerror=()=>reject(req.error);});}
function databaseRequest(mode,operation,data){return new Promise((resolve,reject)=>{if(!studyDB){reject(new Error("Database unavailable"));return;}const tx=studyDB.transaction("studyRecords",mode),store=tx.objectStore("studyRecords");let req;if(operation==="getAll")req=store.getAll();if(operation==="add")req=store.add(data);if(operation==="delete")req=store.delete(data);if(!req){reject(new Error("Unknown operation"));return;}let result;req.onsuccess=()=>{result=req.result;};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Transaction aborted"));});}
function activateFallback(){studyStorageMode="localstorage";studyRecords=readStorage(STORAGE_KEYS.study,[]);if(!Array.isArray(studyRecords))studyRecords=[];}
async function initialiseStudyDatabase(){try{studyDB=await openStudyDatabase();studyRecords=await databaseRequest("readonly","getAll");studyStorageMode="indexeddb";}catch(error){console.warn(error);activateFallback();document.getElementById("studyMessage").textContent="Using backup browser storage.";}renderAnalytics();
    /* Study history is now loaded, so the XP engine can safely seed and sweep. */
    if(typeof window.xpStudyReady==="function")window.xpStudyReady();}
async function saveStudyRecord(record){if(studyStorageMode==="indexeddb"){try{const id=await databaseRequest("readwrite","add",record);studyRecords.push({...record,id});return true;}catch(error){console.error(error);studyStorageMode="localstorage";}}record.id="local-"+Date.now()+"-"+Math.random().toString(16).slice(2);studyRecords.push(record);return writeStorage(STORAGE_KEYS.study,studyRecords);}
async function removeStudyRecord(id){if(studyStorageMode==="indexeddb"){try{await databaseRequest("readwrite","delete",id);studyRecords=studyRecords.filter(r=>r.id!==id);return true;}catch(error){console.error(error);return false;}}studyRecords=studyRecords.filter(r=>r.id!==id);return writeStorage(STORAGE_KEYS.study,studyRecords);}

/* 4. STUDY LOGGER */
const studySubject=document.getElementById("studySubject"),studyChapter=document.getElementById("studyChapter"),studyDuration=document.getElementById("studyDuration"),studyDate=document.getElementById("studyDate"),studyType=document.getElementById("studyType"),studyNotes=document.getElementById("studyNotes"),addStudyButton=document.getElementById("addStudyButton"),studyMessage=document.getElementById("studyMessage");
studyDate.value=localDateKey();
addStudyButton.addEventListener("click",async()=>{
    const subject=studySubject.value,chapter=studyChapter.value.trim(),minutes=Number(studyDuration.value),date=studyDate.value,type=studyType.value,notes=studyNotes.value.trim();
    if(!chapter){studyMessage.textContent="Enter a chapter or topic.";return;}if(!Number.isInteger(minutes)||minutes<1||minutes>1440){studyMessage.textContent="Enter a duration between 1 and 1440 minutes.";return;}if(!date){studyMessage.textContent="Select a study date.";return;}
    const record={subject,chapter,minutes,date,type,notes,createdAt:new Date().toISOString()};addStudyButton.disabled=true;addStudyButton.textContent="SAVING...";const saved=await saveStudyRecord(record);addStudyButton.disabled=false;addStudyButton.textContent="SAVE STUDY RECORD";
    if(!saved){studyMessage.textContent="Could not save this record.";return;}
    /* XP: the saved record carries its own storage id, which keys the award. */
    const chapterDone=document.getElementById("studyChapterDone"),finished=!!(chapterDone&&chapterDone.checked);
    if(window.APEXXP){
        const stored=studyRecords[studyRecords.length-1];
        window.APEXXP.study(stored);
        if(finished)window.APEXXP.chapter(subject,chapter);
        window.APEXXP.checkMilestones();
    }
    if(chapterDone)chapterDone.checked=false;
    studyChapter.value="";studyDuration.value="";studyNotes.value="";studyMessage.textContent=finished?"Study record saved. Chapter marked as finished.":"Study record saved.";renderAnalytics();
});

/* 5. STUDY ANALYTICS — INCLUDING WEEKLY GRAPH */
function getLastSevenDays(){const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);days.push({key:localDateKey(d),label:d.toLocaleDateString("en-IN",{weekday:"short"})});}return days;}
function getDailyMinutes(key){return studyRecords.filter(r=>r.date===key).reduce((sum,r)=>sum+Number(r.minutes||0),0);}
function renderSubjectChart(){const box=document.getElementById("subjectChart");box.replaceChildren();const totals={};studyRecords.forEach(r=>totals[r.subject]=(totals[r.subject]||0)+Number(r.minutes||0));const list=Object.entries(totals).sort((a,b)=>b[1]-a[1]);if(!list.length){box.textContent="No study data yet.";return;}const max=Math.max(...list.map(x=>x[1]));list.forEach(([name,mins])=>{const row=el("div","chart-row"),label=el("span","chart-name",name),track=el("div","chart-track"),fill=el("div","chart-fill"),value=el("span","chart-value",formatStudyTime(mins));fill.style.width=(mins/max*100)+"%";track.appendChild(fill);row.append(label,track,value);box.appendChild(row);});}
function svgNode(tag,attrs={}){const n=document.createElementNS("http://www.w3.org/2000/svg",tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
function renderWeeklyChart(){const box=document.getElementById("weeklyChart");box.replaceChildren();const days=getLastSevenDays(),values=days.map(d=>getDailyMinutes(d.key)),max=Math.max(...values,60),w=520,h=210,l=42,r=14,t=18,b=38,cw=w-l-r,ch=h-t-b;const pts=values.map((v,i)=>({x:l+i/6*cw,y:t+ch-v/max*ch,v}));const svg=svgNode("svg",{viewBox:`0 0 ${w} ${h}`,class:"line-chart",role:"img","aria-label":"Study minutes over the last seven days"});
    for(let i=0;i<=4;i++){const y=t+i/4*ch;svg.appendChild(svgNode("line",{x1:l,x2:w-r,y1:y,y2:y,class:"chart-grid-line"}));const lab=svgNode("text",{x:l-8,y:y+4,"text-anchor":"end",class:"chart-y-label"});lab.textContent=Math.round(max*(1-i/4))+"m";svg.appendChild(lab);}
    const points=pts.map(p=>`${p.x},${p.y}`).join(" ");const area=svgNode("polygon",{points:`${l},${t+ch} ${points} ${w-r},${t+ch}`,class:"chart-area"});svg.appendChild(area);svg.appendChild(svgNode("polyline",{points,class:"chart-line"}));
    pts.forEach((p,i)=>{const c=svgNode("circle",{cx:p.x,cy:p.y,r:4,class:"chart-point"}),title=svgNode("title");title.textContent=`${days[i].label}: ${formatStudyTime(p.v)}`;c.appendChild(title);svg.appendChild(c);const label=svgNode("text",{x:p.x,y:h-9,"text-anchor":"middle",class:"chart-axis-label"});label.textContent=days[i].label;svg.appendChild(label);});box.appendChild(svg);}
function renderDistributionChart(){const box=document.getElementById("distributionChart");box.replaceChildren();const totals={};studyRecords.forEach(r=>totals[r.subject]=(totals[r.subject]||0)+Number(r.minutes||0));const list=Object.entries(totals).sort((a,b)=>b[1]-a[1]),total=list.reduce((s,x)=>s+x[1],0);if(!total){box.textContent="No study data yet.";return;}const colours=["#3678ff","#ef3340","#35cf88","#a78bfa","#ffb547","#43d9e8","#f15bb5","#a8dadc"];let angle=0;const slices=list.map(([name,val],i)=>{const start=angle;angle+=val/total*360;return `${colours[i%colours.length]} ${start}deg ${angle}deg`;});const wrap=el("div","donut-wrap"),donut=el("div","donut"),centre=el("div","donut-centre",formatStudyTime(total)),legend=el("div","donut-legend");donut.style.background=`conic-gradient(${slices.join(",")})`;donut.appendChild(centre);list.forEach(([name,val],i)=>{const row=el("div","legend-item"),dot=el("i","legend-dot"),label=el("span","legend-name",name),pct=el("span","legend-value",Math.round(val/total*100)+"%");dot.style.background=colours[i%colours.length];row.append(dot,label,pct);legend.appendChild(row);});wrap.append(donut,legend);box.appendChild(wrap);}
function renderStudyHeatmap(){const box=document.getElementById("heatmap");box.replaceChildren();const grid=el("div","heatmap"),today=new Date();today.setHours(12,0,0,0);for(let i=34;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const key=localDateKey(d),mins=getDailyMinutes(key),cell=el("div","heat-cell");if(mins>=120)cell.classList.add("heat-3");else if(mins>=60)cell.classList.add("heat-2");else if(mins>0)cell.classList.add("heat-1");cell.title=`${key}: ${formatStudyTime(mins)}`;grid.appendChild(cell);}box.append(grid,legend([["heat-0","NO STUDY"],["heat-1","UNDER 1 H"],["heat-2","1–2 H"],["heat-3","2 H +"]]));}
async function deleteRecord(id){if(await removeStudyRecord(id))renderAnalytics();else studyMessage.textContent="Could not delete this record.";}
function renderStudyRecords(){const box=document.getElementById("studyRecords");box.replaceChildren();const list=[...studyRecords].sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));if(!list.length){box.appendChild(el("p","empty-state","No study records yet. Log your first session above."));return;}list.slice(0,30).forEach(r=>{const row=el("div","record-row"),details=el("div","record-details"),title=el("strong","",`${r.subject} — ${r.chapter}`),meta=el("p","",`${r.date} · ${r.type} · ${formatStudyTime(Number(r.minutes))}`),del=el("button","record-delete","DELETE");details.append(title,meta);if(r.notes)details.appendChild(el("p","record-notes",r.notes));del.type="button";del.addEventListener("click",()=>deleteRecord(r.id));row.append(details,del);box.appendChild(row);});}
function renderStatistics(){const total=studyRecords.reduce((s,r)=>s+Number(r.minutes||0),0),weekly=getLastSevenDays().reduce((s,d)=>s+getDailyMinutes(d.key),0),subjects={};studyRecords.forEach(r=>subjects[r.subject]=(subjects[r.subject]||0)+Number(r.minutes||0));const top=Object.entries(subjects).sort((a,b)=>b[1]-a[1])[0];document.getElementById("totalStudyTime").textContent=formatStudyTime(total);document.getElementById("weeklyAverage").textContent=formatStudyTime(Math.round(weekly/7));document.getElementById("loggedSessions").textContent=studyRecords.length;document.getElementById("topSubject").textContent=top?top[0]:"—";}
function renderAnalytics(){renderStatistics();renderSubjectChart();renderWeeklyChart();renderDistributionChart();renderStudyHeatmap();renderStudyRecords();}

/* 6. APEX QUOTES — IMPORT TXT, STORE LOCALLY, ONE QUOTE PER DAY */
const quoteFile=document.getElementById("quoteFile");
function parseQuoteFile(text){return text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")).map(line=>{const split=line.indexOf("|");return split<0?{text:line,author:""}:{text:line.slice(0,split).trim(),author:line.slice(split+1).trim()};}).filter(q=>q.text);}
function showDailyQuote(){const library=readStorage(STORAGE_KEYS.quotes,[]),today=localDateKey(),saved=readStorage(STORAGE_KEYS.dailyQuote,null);document.getElementById("quoteDate").textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"}).toUpperCase();if(!Array.isArray(library)||!library.length){document.getElementById("dailyQuote").textContent="Your quote library is waiting.";document.getElementById("quoteAuthor").textContent="IMPORT QUOTES.TXT TO BEGIN";return;}let chosen=saved&&saved.date===today&&library[saved.index]?saved:null;if(!chosen){let index=Math.floor(Math.random()*library.length);if(library.length>1&&saved&&index===saved.index)index=(index+1+Math.floor(Math.random()*(library.length-1)))%library.length;chosen={date:today,index};writeStorage(STORAGE_KEYS.dailyQuote,chosen);}document.getElementById("dailyQuote").textContent=`“${library[chosen.index].text}”`;document.getElementById("quoteAuthor").textContent=library[chosen.index].author?`— ${library[chosen.index].author}`:"— APEX QUOTES";}
quoteFile.addEventListener("change",()=>{const file=quoteFile.files&&quoteFile.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const parsed=parseQuoteFile(String(reader.result||""));if(!parsed.length){document.getElementById("quoteMessage").textContent="No valid quotes found. Use one quote per line.";return;}const ok=writeStorage(STORAGE_KEYS.quotes,parsed);if(!ok){document.getElementById("quoteMessage").textContent="Could not save quote library.";return;}writeStorage(STORAGE_KEYS.dailyQuote,null);showDailyQuote();document.getElementById("quoteMessage").textContent=`${parsed.length} quotes imported. Edit the TXT and import again to update.`;quoteFile.value="";};reader.onerror=()=>{document.getElementById("quoteMessage").textContent="Could not read that file.";};reader.readAsText(file);});
showDailyQuote();

/* 7. APEX LIFE v4.2 — WEEKLY HABIT TABLE, MANAGEMENT, ANALYTICS
   Same storage keys: apexHabits (habit list) + apexHabitLogs ({habitId,date,completed,note}). */
const $=id=>document.getElementById(id);
function btn(text,cls,fn){const b=el("button",cls||"",text);b.type="button";b.addEventListener("click",fn);return b;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function mondayOf(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-(x.getDay()+6)%7);return x;}
function dateFromKey(key){const [y,m,d]=String(key).split("-").map(Number);return new Date(y,(m||1)-1,d||1,12);}
const DAYS=["MON","TUE","WED","THU","FRI","SAT","SUN"],DAYS_FULL=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
let habits=readStorage(STORAGE_KEYS.habits,[]),habitLogs=readStorage(STORAGE_KEYS.habitLogs,[]);
if(!Array.isArray(habits))habits=[];if(!Array.isArray(habitLogs))habitLogs=[];
habits=habits.filter(h=>h&&h.id&&h.name);habitLogs=habitLogs.filter(l=>l&&l.habitId&&l.date);
let hWeek=mondayOf(new Date()),hMonth=new Date(),hSel="all",hRange="week";hMonth.setDate(1);hMonth.setHours(12,0,0,0);
const saveHabits=()=>writeStorage(STORAGE_KEYS.habits,habits),saveHabitLogs=()=>writeStorage(STORAGE_KEYS.habitLogs,habitLogs);
const todayKey=()=>localDateKey(),pct=(d,t)=>t?Math.round(d/t*100):0;
function logFor(id,k){return habitLogs.find(l=>l.habitId===id&&l.date===k);}
function isDone(id,k){const l=logFor(id,k);return !!(l&&l.completed);}
function startKey(h){let s=h.createdAt&&!isNaN(new Date(h.createdAt))?localDateKey(new Date(h.createdAt)):todayKey();habitLogs.forEach(l=>{if(l.habitId===h.id&&l.completed&&l.date<s)s=l.date;});return s;}
function tracked(h,k){return k>=startKey(h)&&k<=todayKey();}
const liveHabits=()=>habits.filter(h=>!h.archived&&!h.paused);
function selHabits(){const l=liveHabits();return hSel==="all"?l:l.filter(h=>h.id===hSel);}
function tally(hs,keys){let d=0,t=0;hs.forEach(h=>keys.forEach(k=>{if(tracked(h,k)){t++;if(isDone(h.id,k))d++;}}));return{d,t};}
const weekDays=()=>Array.from({length:7},(_,i)=>localDateKey(addDays(hWeek,i)));
function monthKeys(m){const n=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();return Array.from({length:n},(_,i)=>localDateKey(new Date(m.getFullYear(),m.getMonth(),i+1,12)));}
function allKeys(){const hs=liveHabits();if(!hs.length)return[];const s=hs.map(startKey).sort()[0],out=[];for(let d=dateFromKey(s);localDateKey(d)<=todayKey();d=addDays(d,1))out.push(localDateKey(d));return out;}
const periodKeys=()=>hRange==="week"?weekDays():hRange==="month"?monthKeys(hMonth):allKeys();
const fmtDay=k=>dateFromKey(k).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
function toggleLog(id,k){
  const l=logFor(id,k);const turningOn=l?!l.completed:true;
  if(l)l.completed=!l.completed;else habitLogs.push({habitId:id,date:k,completed:true,note:""});
  saveHabitLogs();renderWeek();renderHabitAnalytics();
  /* XP is keyed on habit id + date, so un-ticking and re-ticking never pays twice. */
  if(turningOn&&window.APEXXP){const h=habits.find(x=>x.id===id);window.APEXXP.habit(id,k,h&&h.name);window.APEXXP.checkMilestones();}
}

function renderWeek(){
  const box=$("habWeek");box.replaceChildren();const keys=weekDays(),today=todayKey(),hs=liveHabits(),nav=el("div","hab-nav");
  nav.append(btn("‹ PREV","secondary",()=>{hWeek=addDays(hWeek,-7);renderHabits();}),el("strong","hab-range",`${fmtDay(keys[0])} – ${fmtDay(keys[6])} ${dateFromKey(keys[6]).getFullYear()}`),btn("NEXT ›","secondary",()=>{hWeek=addDays(hWeek,7);renderHabits();}),btn("THIS WEEK","secondary",()=>{hWeek=mondayOf(new Date());renderHabits();}));
  box.appendChild(nav);
  if(!hs.length){box.appendChild(el("p","empty-state","No active habits. Add one below, or restore a paused/archived habit."));return;}
  const wrap=el("div","hab-table-wrap"),t=el("table","hab-table"),head=el("tr");head.appendChild(el("th","","HABIT"));
  keys.forEach((k,i)=>{const th=el("th",k===today?"is-today":"",DAYS_FULL[i]);th.appendChild(el("small","",String(dateFromKey(k).getDate())));head.appendChild(th);});head.appendChild(el("th","","WEEK"));t.appendChild(head);
  hs.forEach(h=>{const tr=el("tr"),nm=el("td","hab-name");nm.append(el("strong","",h.name),el("small","",h.category||""));tr.appendChild(nm);let done=0;
    keys.forEach(k=>{const td=el("td"),on=isDone(h.id,k),fut=k>today,miss=!on&&!fut&&tracked(h,k);if(on)done++;
      const b=el("button","hcell"+(on?" done":miss?" missed":""),on?"✓":miss?"✕":"");b.type="button";b.disabled=fut;b.setAttribute("aria-pressed",String(on));b.setAttribute("aria-label",`${h.name}, ${k}`);b.addEventListener("click",()=>toggleLog(h.id,k));td.appendChild(b);tr.appendChild(td);});
    tr.appendChild(el("td","hab-total",`${done}/7`));t.appendChild(tr);});
  wrap.appendChild(t);box.appendChild(wrap);const w=tally(hs,keys);
  box.append(el("p","muted-small",`WEEK COMPLETION: ${pct(w.d,w.t)}%  ·  ${w.d} OF ${w.t} TRACKED CHECK-OFFS`),legend([["hc-done","DONE","✓"],["hc-missed","MISSED","✕"],["hc-empty","NOT TRACKED YET / FUTURE"]]));
}
function persistHabits(){saveHabits();renderHabits();}
function editHabit(h){const name=prompt("Habit name:",h.name);if(name===null)return;if(!name.trim()){alert("Habit name cannot be empty.");return;}const d=prompt("Description (optional):",h.description||"");if(d===null)return;h.name=name.trim();h.description=d.trim();persistHabits();}
function askDelete(h){const dlg=$("confirmDialog");$("confirmText").textContent=`Permanently delete “${h.name}” and all of its check-off history? This cannot be undone.`;dlg.dataset.id=h.id;if(typeof dlg.showModal==="function")dlg.showModal();else if(confirm($("confirmText").textContent))doDelete(h.id);}
function doDelete(id){habits=habits.filter(h=>h.id!==id);habitLogs=habitLogs.filter(l=>l.habitId!==id);if(hSel===id)hSel="all";saveHabits();saveHabitLogs();renderHabits();}
$("confirmYes").addEventListener("click",()=>{const d=$("confirmDialog"),id=d.dataset.id;d.close();doDelete(id);});
$("confirmNo").addEventListener("click",()=>$("confirmDialog").close());
function renderManage(){
  const box=$("habList");box.replaceChildren();if(!habits.length){box.appendChild(el("p","empty-state","No habits yet. Add your first one above."));return;}
  habits.forEach(h=>{const row=el("div","record-row"),d=el("div","record-details"),st=h.archived?"ARCHIVED":h.paused?"PAUSED":"ACTIVE";
    d.append(el("strong","",h.name),el("p","",`${h.category||"Other"} · ${st}${h.description?" · "+h.description:""}`));
    const acts=el("div","habit-actions");acts.appendChild(btn("EDIT","secondary",()=>editHabit(h)));
    if(h.archived)acts.appendChild(btn("RESTORE","secondary",()=>{h.archived=false;h.paused=false;persistHabits();}));
    else{acts.appendChild(btn(h.paused?"RESUME":"PAUSE","secondary",()=>{h.paused=!h.paused;persistHabits();}));acts.appendChild(btn("ARCHIVE","secondary",()=>{h.archived=true;persistHabits();}));}
    acts.appendChild(btn("DELETE","record-delete",()=>askDelete(h)));row.append(d,acts);box.appendChild(row);});
}
function graphBuckets(){
  if(hRange==="all"){const m={};allKeys().forEach(k=>(m[k.slice(0,7)]=m[k.slice(0,7)]||[]).push(k));return Object.entries(m).map(([k,v])=>({label:k.slice(2),keys:v}));}
  const keys=hRange==="week"?weekDays():monthKeys(hMonth);return keys.map(k=>({label:hRange==="week"?DAYS[(dateFromKey(k).getDay()+6)%7]:String(+k.slice(8)),keys:[k]}));
}
function renderGraph(card){
  const hs=selHabits(),b=graphBuckets(),n=b.length;card.appendChild(el("h3","","COMPLETION GRAPH"));
  if(!n||!hs.length){card.appendChild(el("p","empty-state","No tracked data for this selection yet."));return;}
  const w=640,h=230,l=40,r=12,t=14,bt=30,cw=w-l-r,ch=h-t-bt,svg=svgNode("svg",{viewBox:`0 0 ${w} ${h}`,class:"line-chart",role:"img","aria-label":"Habit completion percentage"});
  for(let i=0;i<=4;i++){const y=t+i/4*ch;svg.appendChild(svgNode("line",{x1:l,x2:w-r,y1:y,y2:y,class:"chart-grid-line"}));const lb=svgNode("text",{x:l-6,y:y+4,"text-anchor":"end",class:"chart-y-label"});lb.textContent=(100-i*25)+"%";svg.appendChild(lb);}
  const pts=b.map((x,i)=>{const s=tally(hs,x.keys);return{x:l+(n>1?i/(n-1):.5)*cw,v:s.t?pct(s.d,s.t):null,s,label:x.label};});
  let seg=[];const flush=()=>{if(seg.length>1)svg.appendChild(svgNode("polyline",{points:seg.map(p=>`${p.x},${t+ch-p.v/100*ch}`).join(" "),class:"chart-line"}));seg=[];};
  pts.forEach(p=>{if(p.v===null)flush();else seg.push(p);});flush();
  pts.forEach((p,i)=>{if(p.v!==null){const c=svgNode("circle",{cx:p.x,cy:t+ch-p.v/100*ch,r:n>20?3:4,class:"chart-point"}),tt=svgNode("title");tt.textContent=`${p.label}: ${p.v}% (${p.s.d}/${p.s.t})`;c.appendChild(tt);svg.appendChild(c);}
    if(n<=12||i%Math.ceil(n/10)===0){const lb=svgNode("text",{x:p.x,y:h-9,"text-anchor":"middle",class:"chart-axis-label"});lb.textContent=p.label;svg.appendChild(lb);}});
  card.appendChild(svg);
}
function renderPie(card){
  card.appendChild(el("h3","","COMPLETED VS MISSED"));const s=tally(selHabits(),periodKeys());
  if(!s.t){card.appendChild(el("p","empty-state","No tracked check-offs in this period."));return;}
  const p=pct(s.d,s.t),wrap=el("div","donut-wrap"),donut=el("div","donut"),lg=el("div","donut-legend");donut.style.background=`conic-gradient(var(--green) 0 ${p}%,var(--red) ${p}% 100%)`;donut.appendChild(el("div","donut-centre",p+"%"));
  [["var(--green)","Completed",s.d],["var(--red)","Missed",s.t-s.d]].forEach(([c,nm,v])=>{const row=el("div","legend-item"),dot=el("i","legend-dot");dot.style.background=c;row.append(dot,el("span","legend-name",nm),el("span","legend-value",String(v)));lg.appendChild(row);});
  wrap.append(donut,lg);card.appendChild(wrap);
}
function renderLeaderboard(card){
  card.appendChild(el("h3","","LEADERBOARD — COMPLETION RATE"));const keys=periodKeys();
  const rows=liveHabits().map(h=>{const s=tally([h],keys);return{h,s,p:pct(s.d,s.t)};}).sort((a,b)=>(b.s.t>0)-(a.s.t>0)||b.p-a.p||b.s.d-a.s.d);
  if(!rows.length){card.appendChild(el("p","empty-state","No active habits."));return;}
  rows.forEach((r,i)=>{const row=el("div","lb-row"),track=el("div","chart-track"),fill=el("div","chart-fill");fill.style.width=r.p+"%";track.appendChild(fill);
    row.append(el("span","lb-rank",String(i+1)),el("span","chart-name",r.h.name),track,el("span","chart-value",r.s.t?`${r.p}%  (${r.s.d}/${r.s.t})`:"—"));card.appendChild(row);});
}
function renderHeatmap(card){
  const head=el("div","hab-nav");head.append(el("h3","","MONTHLY HEATMAP"),btn("‹","secondary",()=>{hMonth=new Date(hMonth.getFullYear(),hMonth.getMonth()-1,1,12);renderHabitAnalytics();}),el("strong","hab-range",hMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"}).toUpperCase()),btn("›","secondary",()=>{hMonth=new Date(hMonth.getFullYear(),hMonth.getMonth()+1,1,12);renderHabitAnalytics();}));card.appendChild(head);
  const grid=el("div","hab-heat");DAYS.forEach(d=>grid.appendChild(el("span","heat-dow",d[0])));
  for(let i=0;i<(hMonth.getDay()+6)%7;i++)grid.appendChild(el("span","heat-blank"));
  const hs=selHabits();monthKeys(hMonth).forEach(k=>{const s=tally(hs,[k]),st=!s.t?"untracked":s.d===s.t?"full":s.d===0?"miss":"part",c=el("span","hday "+st,String(+k.slice(8)));c.title=s.t?`${k}: ${s.d}/${s.t} completed`:`${k}: untracked`;grid.appendChild(c);});
  card.append(grid,legend([["full","ALL COMPLETED"],["part","PARTIALLY COMPLETED"],["miss","MISSED"],["untracked","UNTRACKED"]]));
}
function renderHabitAnalytics(){
  const box=$("habAnalytics");box.replaceChildren();const live=liveHabits();if(hSel!=="all"&&!live.some(h=>h.id===hSel))hSel="all";
  const ctl=el("div","card hab-controls"),sel=el("select");sel.setAttribute("aria-label","Habit");sel.appendChild(new Option("All Habits","all"));live.forEach(h=>sel.appendChild(new Option(h.name,h.id)));sel.value=hSel;sel.addEventListener("change",()=>{hSel=sel.value;renderHabitAnalytics();});
  const seg=el("div","seg");[["week","WEEKLY"],["month","MONTHLY"],["all","ALL-TIME"]].forEach(([v,t])=>seg.appendChild(btn(t,"secondary"+(hRange===v?" on":""),()=>{hRange=v;renderHabitAnalytics();})));
  const note=el("span","muted-small",hRange==="week"?`WEEK OF ${fmtDay(weekDays()[0])}`:hRange==="month"?hMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"}).toUpperCase():"SINCE FIRST HABIT");
  ctl.append(el("h3","","HABIT ANALYTICS"),sel,seg,note);box.appendChild(ctl);
  const grid=el("div","hab-grid");["card hab-graph","card","card","card hab-heatcard"].forEach((c,i)=>{const card=el("div",c);[renderGraph,renderPie,renderLeaderboard,renderHeatmap][i](card);grid.appendChild(card);});box.appendChild(grid);
}
function renderHabits(){renderWeek();renderManage();renderHabitAnalytics();}
$("habitForm").addEventListener("submit",e=>{e.preventDefault();const name=$("habitName").value.trim();if(!name)return;
  habits.push({id:"habit-"+Date.now()+"-"+Math.random().toString(16).slice(2),name,description:$("habitDescription").value.trim(),category:$("habitCategory").value,frequency:"daily",weekdays:[],weeklyTarget:7,createdAt:new Date().toISOString(),paused:false,archived:false});
  saveHabits();e.target.reset();$("habitFormMessage").textContent="Habit added.";renderHabits();});
renderHabits();

/* 8. FITNESS v4.2 — FOUR SYSTEMS + REST DAYS. Same key: apexFitnessRecords.
   v4.1 records (no "kind") are kept untouched and shown as legacy in the Overview history. */
const FIT_KEY="apexFitnessRecords";let fit=readStorage(FIT_KEY,[]);if(!Array.isArray(fit))fit=[];fit=fit.filter(r=>r&&r.date);
let fitTab="overview",fitFilter="all";
const saveFit=()=>writeStorage(FIT_KEY,fit),num=v=>Number(v)||0,fitId=()=>"fitness-"+Date.now()+"-"+Math.random().toString(16).slice(2);
const FIT_TABS=[["overview","OVERVIEW"],["strength","STRENGTH"],["endurance","ENDURANCE"],["football","FOOTBALL"],["other","OTHER SPORTS"]];
const EXERCISES=["Pull-ups","Chin-ups","Push-ups","Dips","Bodyweight Squats","Sit-ups","Pike Push-ups","Inverted Rows"];
const POSITIONS=["Goalkeeper","Centre Back","Full Back","Defensive Mid","Central Mid","Attacking Mid","Winger","Striker"];
const SPORTS=["Badminton","Basketball","Cricket","Swimming","Table Tennis","Tennis","Volleyball","Other"];
function fld(label,node){const w=el("label","fit-field");w.append(el("span","",label),node);return w;}
function inp(type,id,o={}){const n=el(type==="textarea"?"textarea":"input");if(type!=="textarea")n.type=type;n.id=id;Object.entries(o).forEach(([k,v])=>n.setAttribute(k,v));return n;}
function sel2(id,opts){const n=el("select");n.id=id;opts.forEach(o=>n.appendChild(new Option(o,o)));return n;}
const bar=(vals,fmt,cap)=>{const w=el("div","mini-bars"),mx=Math.max(...vals.map(v=>v.v),.0001);vals.forEach(v=>{const c=el("div","mini-col"),b=el("i");b.style.height=Math.max(4,v.v/mx*100)+"%";c.title=`${v.l}: ${fmt(v.v)}`;c.append(b,el("small","",v.l));w.appendChild(c);});return w;};
const fmtPace=m=>{if(!isFinite(m)||m<=0)return"—";const mm=Math.floor(m),ss=Math.round((m-mm)*60);return ss===60?`${mm+1}:00`:`${mm}:${String(ss).padStart(2,"0")}`;};
const byKind=k=>fit.filter(r=>r.kind===k).sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
function statCard(label,value){const c=el("div","card stat-card");c.append(el("p","",label),el("strong","",String(value)));return c;}
function section(title){const c=el("div","card");c.appendChild(el("h3","",title));return c;}
function msgLine(id){const p=el("p","form-message");p.id=id;p.setAttribute("role","status");return p;}
function prSet(){const ids=new Set(),max={};fit.filter(r=>r.kind==="strength").sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt||"").localeCompare(String(b.createdAt||""))).forEach(r=>{if(r.totalReps>(max[r.exercise]||0)){ids.add(r.id);max[r.exercise]=r.totalReps;}});return ids;}
function describe(r){
  const k=r.kind;
  if(k==="strength")return[`${r.exercise} — ${r.totalReps} reps`,`${r.date} · ${r.sets.length} ${r.sets.length===1?"set":"sets"}: ${r.sets.join(" · ")}`,[r.notes]];
  if(k==="endurance")return[`${r.activity} — ${r.distance} km in ${r.minutes} min`,`${r.date} · pace ${fmtPace(r.minutes/r.distance)} /km · ${(r.distance/(r.minutes/60)).toFixed(1)} km/h`,[r.notes]];
  if(k==="football")return[`Football ${r.session} — ${r.position}`,`${r.date} · ${r.minutes} min${r.rating?" · rating "+r.rating+"/10":""}${r.details?" · "+r.details:""}`,[r.strengths&&"Strengths: "+r.strengths,r.weaknesses&&"Weaknesses: "+r.weaknesses,r.notes]];
  if(k==="other")return[`${r.sport}${r.minutes?" — "+r.minutes+" min":""}`,`${r.date}${r.details?" · "+r.details:""}`,[r.notes]];
  if(k==="rest")return["Rest day",r.date,[r.notes]];
  return[`${r.category||"Session"} — ${r.activity||""}`,`${r.date} · ${r.minutes||0} min · v4.1 record`,[r.notes]];
}
function fitRow(r,prs){
  const [title,meta,extra]=describe(r),row=el("div","record-row"),d=el("div","record-details"),st=el("strong","",title);
  if(prs&&prs.has(r.id))st.appendChild(el("span","pr-badge","PR"));d.append(st,el("p","",meta));extra.filter(Boolean).forEach(x=>d.appendChild(el("p","record-notes",x)));
  row.append(d,btn("DELETE","record-delete",()=>{if(confirm("Delete this record permanently?")){fit=fit.filter(x=>x.id!==r.id);saveFit();renderFitness();}}));return row;
}
function history(title,list,prs){const c=section(title);if(!list.length)c.appendChild(el("p","empty-state","Nothing logged yet."));list.slice(0,60).forEach(r=>c.appendChild(fitRow(r,prs)));return c;}
function formCard(title,fields,onSave,msgId){
  const c=section(title),f=el("form","fit-form");fields.forEach(x=>f.appendChild(x));const sb=el("button","","SAVE");sb.type="submit";f.append(sb,msgLine(msgId));
  f.addEventListener("submit",e=>{e.preventDefault();const m=onSave();$(msgId).textContent=m.msg;
    if(m.ok){saveFit();
      /* Every fitness form pushes exactly one record, so the new one is the last. */
      if(window.APEXXP){window.APEXXP.fitness(fit[fit.length-1]);window.APEXXP.checkMilestones();}
      renderFitness();const n=$(msgId);if(n)n.textContent=m.msg;}});c.appendChild(f);return c;
}
const today0=()=>localDateKey();
function legend(items){const w=el("div","key-legend");items.forEach(([cls,text,glyph])=>{const i=el("span","key-item");i.append(el("i","key-swatch "+cls,glyph||""),el("span","",text));w.appendChild(i);});return w;}
const CATCOL={strength:"#3678ff",endurance:"#22b573",football:"#ef3340",other:"#e8a02f"},CATNAME={strength:"Strength",endurance:"Endurance",football:"Football",other:"Other Sports"};
function kindBucket(r){if(CATNAME[r.kind])return r.kind;const c=String(r.category||"").toLowerCase();return CATNAME[c]&&c!=="other"?c:"other";}
function activityOf(r){const k=r.kind;if(k==="strength")return r.exercise;if(k==="endurance")return r.activity;if(k==="football")return"Football "+String(r.session||"training").toLowerCase();if(k==="other")return r.sport;return r.activity||r.category||"Session";}
let fitPieMode="category";
function panelPie(root){
  const c=section("WHAT YOU TRAIN MOST"),acts=fit.filter(r=>r.kind!=="rest"),seg=el("div","seg");
  [["category","BY CATEGORY"],["activity","BY ACTIVITY"]].forEach(([v,t])=>seg.appendChild(btn(t,"secondary"+(fitPieMode===v?" on":""),()=>{fitPieMode=v;renderFitness();})));c.appendChild(seg);
  if(!acts.length){c.appendChild(el("p","empty-state","Log a session to see your training split."));root.appendChild(c);return;}
  const m={};acts.forEach(r=>{const name=fitPieMode==="category"?CATNAME[kindBucket(r)]:String(activityOf(r)).trim(),key=name.toLowerCase();(m[key]=m[key]||{name,n:0,bucket:kindBucket(r)}).n++;});
  let list=Object.values(m).sort((a,b)=>b.n-a.n);const pal=["#3678ff","#35cf88","#ef3340","#ffb547","#a78bfa","#43d9e8","#f15bb5","#6b7a90"];
  if(fitPieMode==="activity"&&list.length>8){const rest=list.slice(7).reduce((a,x)=>a+x.n,0);list=list.slice(0,7).concat([{name:"Everything else",n:rest}]);}
  list.forEach((x,i)=>{x.col=fitPieMode==="category"?CATCOL[x.bucket]:pal[i%pal.length];});
  const total=list.reduce((a,x)=>a+x.n,0);let ang=0;const slices=list.map(x=>{const a=ang;ang+=x.n/total*360;return`${x.col} ${a}deg ${ang}deg`;});
  const wrap=el("div","donut-wrap"),donut=el("div","donut"),centre=el("div","donut-centre"),lg=el("div","donut-legend");donut.style.background=`conic-gradient(${slices.join(",")})`;
  centre.append(String(total),document.createElement("br"),el("small","muted-small","SESSIONS"));donut.appendChild(centre);
  list.forEach(x=>{const row=el("div","legend-item"),dot=el("i","legend-dot");dot.style.background=x.col;row.append(dot,el("span","legend-name",x.name),el("span","legend-value",`${x.n} · ${Math.round(x.n/total*100)}%`));lg.appendChild(row);});
  wrap.append(donut,lg);c.appendChild(wrap);root.appendChild(c);
}
function streakCard(n,doneToday){const c=el("div","card stat-card streak-card"+(n?" hot":" cold")),row=el("div","streak-row");row.append(el("span","flame","🔥"),el("strong","",String(n)));
  c.append(el("p","","TRAINING STREAK"),row,el("p","muted-small",n?(doneToday?(n===1?"DAY · KEEP IT BURNING":"DAYS · KEEP IT BURNING"):"DAYS · TRAIN TODAY TO KEEP IT"):"LOG A SESSION TO LIGHT IT"));return c;}

function panelOverview(root){
  const t=today0(),acts=fit.filter(r=>r.kind!=="rest"),days=n=>Array.from({length:n},(_,i)=>localDateKey(addDays(new Date(),-i)));
  const last7=new Set(days(7)),a7=acts.filter(r=>last7.has(r.date)).length,rest=fit.filter(r=>r.kind==="rest").length;
  const has=k=>fit.some(r=>r.date===k&&r.kind!=="rest"),hasRest=k=>fit.some(r=>r.date===k&&r.kind==="rest");
  let streak=0;for(const k of days(400)){if(has(k))streak++;else if(hasRest(k))continue;else if(k===t)continue;else break;}
  const g=el("div","stats-grid");g.append(statCard("SESSIONS LOGGED",acts.length),statCard("LAST 7 DAYS",a7),statCard("REST DAYS",rest),streakCard(streak,has(t)));root.appendChild(g);
  const cal=section("LAST 28 DAYS"),strip=el("div","cal-strip");days(28).reverse().forEach(k=>{const rs=fit.filter(r=>r.date===k),act=rs.find(r=>r.kind!=="rest"),c=el("span","cal-day"+(act?" k-"+kindBucket(act):rs.length?" k-rest":""),String(+k.slice(8)));c.title=`${k}: ${rs.length?rs.map(r=>describe(r)[0]).join(", "):"no record"}`;strip.appendChild(c);});
  cal.append(strip,legend([["k-strength","STRENGTH"],["k-endurance","ENDURANCE"],["k-football","FOOTBALL"],["k-other","OTHER SPORTS"],["k-rest","REST DAY"],["k-none","NOTHING LOGGED"]]));
  const rf=formCard("LOG A REST DAY",[fld("DATE",inp("date","restDate",{value:t,required:""})),fld("NOTE (OPTIONAL)",inp("text","restNote",{maxlength:200,placeholder:"Recovery, sore legs, travel..."}))],()=>{const d=$("restDate").value;if(!d)return{ok:false,msg:"Select a date."};fit.push({id:fitId(),kind:"rest",date:d,notes:$("restNote").value.trim(),createdAt:new Date().toISOString()});return{ok:true,msg:"Rest day saved."};},"restMsg");
  const hc=section("TRAINING HISTORY — ALL SYSTEMS"),fs=el("select");fs.setAttribute("aria-label","Filter history");[["all","All records"],["strength","Strength"],["endurance","Endurance"],["football","Football"],["other","Other sports"],["rest","Rest days"],["legacy","v4.1 records"]].forEach(([v,l])=>fs.appendChild(new Option(l,v)));fs.value=fitFilter;fs.addEventListener("change",()=>{fitFilter=fs.value;renderFitness();});hc.appendChild(fs);
  const list=fit.filter(r=>fitFilter==="all"||(r.kind||"legacy")===fitFilter).sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
  if(!list.length)hc.appendChild(el("p","empty-state","No records for this filter."));const prs=prSet();list.slice(0,80).forEach(r=>hc.appendChild(fitRow(r,prs)));
  panelPie(root);root.append(cal,rf,hc);
}
function panelStrength(root){
  const ex=sel2("sExercise",EXERCISES);
  const f=formCard("LOG STRENGTH SESSION",[fld("EXERCISE",ex),fld("OR CUSTOM EXERCISE",inp("text","sCustom",{maxlength:40,placeholder:"e.g. Archer push-ups"})),fld("DATE",inp("date","sDate",{value:today0(),required:""})),fld("REPS PER SET",inp("text","sReps",{placeholder:"e.g. 10, 8, 8, 6 (comma separated)",required:""})),fld("NOTES",inp("textarea","sNotes",{rows:2,maxlength:300}))],()=>{
    const sets=$("sReps").value.split(/[,\s]+/).filter(Boolean).map(Number);if(!sets.length||sets.some(n=>!Number.isInteger(n)||n<1||n>1000))return{ok:false,msg:"Enter whole numbers of reps, e.g. 10, 8, 6."};
    const exercise=$("sCustom").value.trim()||$("sExercise").value;if(!$("sDate").value)return{ok:false,msg:"Select a date."};
    fit.push({id:fitId(),kind:"strength",exercise,date:$("sDate").value,sets,totalReps:sets.reduce((a,b)=>a+b,0),notes:$("sNotes").value.trim(),createdAt:new Date().toISOString()});return{ok:true,msg:"Strength session saved."};},"sMsg");
  const an=section("PERSONAL RECORDS & PROGRESS"),all=byKind("strength"),groups={};all.slice().reverse().forEach(r=>(groups[r.exercise]=groups[r.exercise]||[]).push(r));
  if(!all.length)an.appendChild(el("p","empty-state","Log a session to see records and trends."));
  Object.entries(groups).forEach(([name,rs])=>{const row=el("div","pr-card"),best=Math.max(...rs.map(r=>Math.max(...r.sets))),bt=Math.max(...rs.map(r=>r.totalReps)),tot=rs.reduce((a,r)=>a+r.totalReps,0);
    const info=el("div");info.append(el("strong","",name),el("p","muted-small",`BEST SET ${best} · BEST SESSION ${bt} · TOTAL ${tot} · ${rs.length} SESSIONS`));row.append(info,bar(rs.slice(-8).map(r=>({l:r.date.slice(5),v:r.totalReps})),v=>v+" reps"));an.appendChild(row);});
  root.append(f,an,history("STRENGTH HISTORY",all,prSet()));
}
function panelEndurance(root){
  const f=formCard("LOG RUN / RIDE",[fld("ACTIVITY",sel2("eType",["Running","Cycling"])),fld("DISTANCE (KM)",inp("number","eDist",{min:"0.1",max:"1000",step:"0.01",required:""})),fld("DURATION (MINUTES)",inp("number","eMin",{min:"1",max:"2000",step:"0.1",required:""})),fld("DATE",inp("date","eDate",{value:today0(),required:""})),fld("NOTES",inp("textarea","eNotes",{rows:2,maxlength:300}))],()=>{
    const distance=num($("eDist").value),minutes=num($("eMin").value);if(distance<=0||minutes<=0||!$("eDate").value)return{ok:false,msg:"Enter distance, duration and date."};
    fit.push({id:fitId(),kind:"endurance",activity:$("eType").value,distance,minutes,date:$("eDate").value,notes:$("eNotes").value.trim(),createdAt:new Date().toISOString()});return{ok:true,msg:"Session saved."};},"eMsg");
  const all=byKind("endurance"),an=section("ENDURANCE PROGRESS");
  if(!all.length)an.appendChild(el("p","empty-state","Log a run or ride to see pace and trends."));
  ["Running","Cycling"].forEach(t=>{const rs=all.filter(r=>r.activity===t);if(!rs.length)return;const km=rs.reduce((a,r)=>a+r.distance,0),mn=rs.reduce((a,r)=>a+r.minutes,0),best=Math.min(...rs.map(r=>r.minutes/r.distance));
    const info=el("div");info.append(el("strong","",t.toUpperCase()),el("p","muted-small",`${rs.length} SESSIONS · ${km.toFixed(1)} KM · AVG PACE ${fmtPace(mn/km)}/KM · BEST PACE ${fmtPace(best)}/KM`));const row=el("div","pr-card");row.append(info,bar(rs.slice(0,8).reverse().map(r=>({l:r.date.slice(5),v:r.minutes/r.distance})),v=>fmtPace(v)+" /km (lower is faster)"));an.appendChild(row);});
  if(all.length){const wk=[];for(let i=7;i>=0;i--){const s=mondayOf(addDays(new Date(),-7*i)),a=localDateKey(s),b=localDateKey(addDays(s,6));wk.push({l:a.slice(5),v:all.filter(r=>r.date>=a&&r.date<=b).reduce((x,r)=>x+r.distance,0)});}
    an.append(el("p","muted-small","WEEKLY DISTANCE — LAST 8 WEEKS (KM)"),bar(wk,v=>v.toFixed(1)+" km"));}
  root.append(f,an,history("ENDURANCE HISTORY",all));
}
function panelFootball(root){
  const f=formCard("LOG FOOTBALL SESSION",[fld("TYPE",sel2("fType",["Training","Match"])),fld("POSITION PLAYED",sel2("fPos",POSITIONS)),fld("DATE",inp("date","fDate",{value:today0(),required:""})),fld("MINUTES",inp("number","fMin",{min:"1",max:"240",required:""})),fld("DETAILS",inp("text","fDetails",{maxlength:120,placeholder:"Opponent, score or drill focus"})),fld("RATING (1–10)",inp("number","fRate",{min:"1",max:"10"})),fld("STRENGTHS",inp("textarea","fStr",{rows:2,maxlength:300})),fld("WEAKNESSES",inp("textarea","fWeak",{rows:2,maxlength:300})),fld("NOTES",inp("textarea","fNotes",{rows:2,maxlength:300}))],()=>{
    const minutes=num($("fMin").value),rating=num($("fRate").value);if(minutes<1||!$("fDate").value)return{ok:false,msg:"Enter minutes and date."};if($("fRate").value&&(rating<1||rating>10))return{ok:false,msg:"Rating must be 1–10."};
    fit.push({id:fitId(),kind:"football",session:$("fType").value,position:$("fPos").value,date:$("fDate").value,minutes,details:$("fDetails").value.trim(),rating:rating||0,strengths:$("fStr").value.trim(),weaknesses:$("fWeak").value.trim(),notes:$("fNotes").value.trim(),createdAt:new Date().toISOString()});return{ok:true,msg:"Football session saved."};},"fMsg");
  const all=byKind("football"),an=section("FOOTBALL SUMMARY");
  if(!all.length)an.appendChild(el("p","empty-state","Log training or a match to see your summary."));
  else{const rated=all.filter(r=>r.rating),avg=rated.length?(rated.reduce((a,r)=>a+r.rating,0)/rated.length).toFixed(1):"—",pos={};all.forEach(r=>{const p=r.position||"Unrecorded";pos[p]=(pos[p]||0)+1;});const tp=Object.entries(pos).sort((a,b)=>b[1]-a[1])[0][0];
    const g=el("div","stats-grid");g.append(statCard("SESSIONS",all.length),statCard("MATCHES",all.filter(r=>r.session==="Match").length),statCard("AVG RATING",avg),statCard("MAIN POSITION",tp));an.appendChild(g);
    if(rated.length)an.append(el("p","muted-small","RATING TREND — LAST 8 RATED SESSIONS"),bar(rated.slice(0,8).reverse().map(r=>({l:r.date.slice(5),v:r.rating})),v=>v+"/10"));
    const lists=el("div","two-col");[["RECENT STRENGTHS","strengths"],["RECENT WEAKNESSES","weaknesses"]].forEach(([t,k])=>{const c=el("div");c.appendChild(el("p","muted-small",t));all.filter(r=>r[k]).slice(0,4).forEach(r=>c.appendChild(el("p","record-notes",`${r.date.slice(5)} — ${r[k]}`)));lists.appendChild(c);});an.appendChild(lists);}
  root.append(f,an,history("FOOTBALL HISTORY",all));
}
function panelOther(root){
  const f=formCard("LOG OTHER SPORT",[fld("SPORT",sel2("oSport",SPORTS)),fld("OR CUSTOM SPORT",inp("text","oCustom",{maxlength:40})),fld("DATE",inp("date","oDate",{value:today0(),required:""})),fld("DURATION (MINUTES)",inp("number","oMin",{min:"1",max:"600",required:""})),fld("DETAILS",inp("text","oDetails",{maxlength:120,placeholder:"Score, result or intensity"})),fld("NOTES",inp("textarea","oNotes",{rows:2,maxlength:300}))],()=>{
    const minutes=num($("oMin").value);if(minutes<1||!$("oDate").value)return{ok:false,msg:"Enter duration and date."};
    fit.push({id:fitId(),kind:"other",sport:$("oCustom").value.trim()||$("oSport").value,date:$("oDate").value,minutes,details:$("oDetails").value.trim(),notes:$("oNotes").value.trim(),createdAt:new Date().toISOString()});return{ok:true,msg:"Session saved."};},"oMsg");
  const all=byKind("other"),an=section("SPORT SUMMARY"),g={};all.forEach(r=>{g[r.sport]=g[r.sport]||{n:0,m:0};g[r.sport].n++;g[r.sport].m+=r.minutes;});
  if(!all.length)an.appendChild(el("p","empty-state","Log a session to see time per sport."));const mx=Math.max(1,...Object.values(g).map(x=>x.m));
  Object.entries(g).sort((a,b)=>b[1].m-a[1].m).forEach(([n,v])=>{const row=el("div","chart-row"),tr=el("div","chart-track"),fl=el("div","chart-fill");fl.style.width=v.m/mx*100+"%";tr.appendChild(fl);row.append(el("span","chart-name",n),tr,el("span","chart-value",`${v.n}× · ${formatStudyTime(v.m)}`));an.appendChild(row);});
  root.append(f,an,history("OTHER SPORTS HISTORY",all));
}
function renderFitness(){
  const root=$("fitRoot");if(!root)return;root.replaceChildren();const tabs=el("div","fit-tabs");
  FIT_TABS.forEach(([id,label])=>tabs.appendChild(btn(label,"secondary"+(fitTab===id?" on":""),()=>{fitTab=id;renderFitness();})));root.appendChild(tabs);
  const panel=el("div","fit-panel");({overview:panelOverview,strength:panelStrength,endurance:panelEndurance,football:panelFootball,other:panelOther})[fitTab](panel);root.appendChild(panel);
}
renderFitness();


/* 10. WATCH — preset dials, preset hand styles, or your own photo. Key: apexWatch
   Click the watch at any time to open the editor. */
const WATCH_KEY="apexWatch",WD=280,WC=300;
const HAND_COLOURS=[["#ffffff","White"],["#0b0f17","Black"],["#d4af37","Gold"],["#56b5ff","Blue"],["#ef3340","Red"],["#35cf88","Green"]];
const HAND_STYLES=[["baton","Baton"],["dauphine","Dauphine"],["sword","Sword"],["pencil","Pencil"],["skeleton","Skeleton"]];
const DIAL_PRESETS=[
  {id:"onyx",name:"Onyx",face:["#232a35","#070a10"],ring:"#2b3648",marks:"#dbe2ec"},
  {id:"apex",name:"APEX Blue",face:["#1b3a6b","#070d18"],ring:"#3678ff",marks:"#d6e6ff"},
  {id:"crimson",name:"Crimson",face:["#6c1720","#190407"],ring:"#a91e2a",marks:"#ffdfe2"},
  {id:"emerald",name:"Emerald",face:["#156245","#04170f"],ring:"#16845c",marks:"#d8f6e8"},
  {id:"gold",name:"Midnight Gold",face:["#1a1d26","#06080c"],ring:"#d4af37",marks:"#e8cd7a"},
  {id:"silver",name:"Silver",face:["#eef1f6","#9aa6b6"],ring:"#8d99a8",marks:"#1b2330",light:true},
  {id:"cream",name:"Vintage",face:["#f5ecd7","#c9b892"],ring:"#9a8762",marks:"#2b2317",light:true,numerals:true},
  {id:"carbon",name:"Carbon",face:["#2a313c","#0a0e14"],ring:"#39424f",marks:"#9fb0c6"},
  {id:"violet",name:"Violet",face:["#3b2a6b","#0b0718"],ring:"#a78bfa",marks:"#e4dcff"},
  {id:"teal",name:"Teal",face:["#10404c","#03141a"],ring:"#43d9e8",marks:"#d4f4f9",numerals:true}
];
let watch=normaliseWatch(readStorage(WATCH_KEY,null)),wDraft=null,wDrag=null,watchTab="preset",dialUid=0;
function validStyle(style){ return HAND_STYLES.some(s=>s[0]===style)?style:"baton"; }
function validColour(colour){ return HAND_COLOURS.some(c=>c[0]===colour)?colour:"#ffffff"; }
function presetById(id){ return DIAL_PRESETS.find(d=>d.id===id)||DIAL_PRESETS[0]; }
function normaliseWatch(saved){
  if(!saved||typeof saved!=="object")return null;
  const style=validStyle(saved.style),hands=validColour(saved.hands);
  if(saved.kind==="preset"&&DIAL_PRESETS.some(d=>d.id===saved.dial))return{kind:"preset",dial:saved.dial,style,hands};
  if(typeof saved.image==="string"&&saved.image.startsWith("data:image/"))return{kind:"photo",image:saved.image,style,hands};
  return null;
}
function angles(d){d=d||new Date();const s=d.getSeconds()+d.getMilliseconds()/1000,m=d.getMinutes()+s/60,h=d.getHours()%12+m/60;return{h:h*30,m:m*6,s:s*6};}

/* --- Dial and hand drawing (pure SVG, nothing to download) --- */
function dialSvg(preset){
  const uid="apexDial"+(++dialUid),svg=svgNode("svg",{viewBox:"-50 -50 100 100",class:"dial-svg","aria-hidden":"true"});
  const defs=svgNode("defs"),grad=svgNode("radialGradient",{id:uid,cx:"40%",cy:"32%",r:"78%"});
  grad.append(svgNode("stop",{offset:"0%","stop-color":preset.face[0]}),svgNode("stop",{offset:"100%","stop-color":preset.face[1]}));
  defs.appendChild(grad);svg.appendChild(defs);
  svg.appendChild(svgNode("circle",{r:50,fill:`url(#${uid})`}));
  svg.appendChild(svgNode("circle",{r:46.5,fill:"none",stroke:preset.ring,"stroke-width":2.4}));
  for(let i=0;i<60;i++){
    const major=i%5===0,outer=42.5,len=major?6.5:3,angle=i*6*Math.PI/180;
    if(preset.numerals&&major&&i%15===0)continue;
    svg.appendChild(svgNode("line",{x1:Math.sin(angle)*outer,y1:-Math.cos(angle)*outer,x2:Math.sin(angle)*(outer-len),y2:-Math.cos(angle)*(outer-len),
      stroke:preset.marks,"stroke-opacity":major?.95:.45,"stroke-width":major?2.1:.8,"stroke-linecap":"round"}));
  }
  if(preset.numerals)[["12",0,-36],["3",36,0],["6",0,37],["9",-36,0]].forEach(([n,x,y])=>{
    const t=svgNode("text",{x,y,"text-anchor":"middle","dominant-baseline":"central",fill:preset.marks,"font-size":11,"font-family":"'Barlow Condensed',sans-serif","font-weight":600});
    t.textContent=n;svg.appendChild(t);
  });
  const brand=svgNode("text",{x:0,y:-20,"text-anchor":"middle",fill:preset.marks,"font-size":4.4,"letter-spacing":1.3,opacity:.7,"font-family":"'DM Mono',monospace"});
  brand.textContent="APEX";svg.appendChild(brand);
  return svg;
}
function handShape(style,len,width,colour){
  const tail=len*.2;
  if(style==="second")return svgNode("line",{x1:0,y1:tail,x2:0,y2:-len,stroke:colour,"stroke-width":width,"stroke-linecap":"round"});
  if(style==="dauphine")return svgNode("polygon",{points:`0,${-len} ${width},${-len*.55} 0,${tail} ${-width},${-len*.55}`,fill:colour});
  if(style==="sword")return svgNode("polygon",{points:`0,${-len} ${width*.9},${-len*.8} ${width*.9},${tail} ${-width*.9},${tail} ${-width*.9},${-len*.8}`,fill:colour});
  if(style==="pencil")return svgNode("rect",{x:-width*.8,y:-len,width:width*1.6,height:len+tail,rx:width*.5,fill:colour});
  if(style==="skeleton")return svgNode("polygon",{points:`0,${-len} ${width},${-len*.76} ${width},${tail} ${-width},${tail} ${-width},${-len*.76}`,fill:"none",stroke:colour,"stroke-width":.9,"stroke-linejoin":"round"});
  return svgNode("line",{x1:0,y1:tail,x2:0,y2:-len,stroke:colour,"stroke-width":width,"stroke-linecap":"round"});
}
function handsSvg(colour,style){
  colour=validColour(colour);style=validStyle(style);
  const svg=svgNode("svg",{viewBox:"-50 -50 100 100",class:"watch-hands","aria-hidden":"true"});
  svg.style.filter=colour==="#0b0f17"?"drop-shadow(0 0 1.4px rgba(255,255,255,.9))":"drop-shadow(0 0 1.4px rgba(0,0,0,.85))";
  const hour=svgNode("g",{class:"wh-hour"}),minute=svgNode("g",{class:"wh-min"}),second=svgNode("g",{class:"wh-sec"});
  hour.appendChild(handShape(style,25,3.4,colour));
  minute.appendChild(handShape(style,37,2.5,colour));
  second.appendChild(handShape("second",40,1,"#ef3340"));
  svg.append(hour,minute,second,svgNode("circle",{r:2.5,fill:colour}),svgNode("circle",{r:1.1,fill:"#ef3340"}));
  return svg;
}
function dialNode(config,extraClass){
  const node=el("div","watch-dial"+(extraClass?" "+extraClass:""));
  if(config.kind==="photo"&&config.image){node.style.backgroundImage=`url("${config.image}")`;}
  else{const preset=presetById(config.dial);node.appendChild(dialSvg(preset));node.style.borderColor=preset.ring;}
  return node;
}

/* --- Home slot --- */
let watchMode="";
function renderWatchSlot(){
  const slot=$("watchSlot");slot.replaceChildren();slot.style.removeProperty("border-color");
  if(timerActive()){watchMode="timer";buildWatchCountdown();return;}
  if(!watch){watchMode="empty";slot.className="watch-slot empty";slot.append(el("span","watch-plus","\u231a"),el("small","","ADD WATCH"));slot.setAttribute("aria-label","Add a watch. Click to choose a dial.");return;}
  watchMode="dial";slot.className="watch-slot";
  const dial=dialNode(watch);dial.appendChild(handsSvg(watch.hands,watch.style));
  slot.appendChild(dial);slot.setAttribute("aria-label","Watch. Click to change the dial or hands.");watchTick();
}
/* The watch becomes an iPhone-style countdown while a focus session is live. */
function buildWatchCountdown(){
  const slot=$("watchSlot");slot.className="watch-slot timer-mode";
  slot.appendChild(watch?dialNode(watch,"wd-dim"):el("div","watch-dial wd-plain"));
  const svg=svgNode("svg",{viewBox:"0 0 120 120",class:"wt-ring","aria-hidden":"true"});
  svg.append(svgNode("circle",{cx:60,cy:60,r:54,class:"wt-track"}),svgNode("circle",{cx:60,cy:60,r:54,class:"wt-prog"}));
  const face=el("div","wt-face");face.append(el("span","wt-time",""),el("span","wt-end",""));
  slot.append(svg,face);slot.setAttribute("aria-label","Focus countdown. Click to change the watch.");
  updateWatchCountdown();
}
function updateWatchCountdown(){
  const slot=$("watchSlot"),prog=slot.querySelector(".wt-prog");if(!prog)return;
  prog.style.strokeDasharray=RING_LENGTH;prog.style.strokeDashoffset=String(RING_LENGTH*(1-timerFraction()));
  slot.querySelector(".wt-time").textContent=formatClock(remainingTime);
  slot.querySelector(".wt-end").textContent=timerRunning?"ENDS "+clockAfter(remainingTime):"PAUSED";
  const tone=timerTone();
  slot.classList.toggle("is-paused",tone==="paused");slot.classList.toggle("is-warning",tone==="warning");
}
function syncWatchTimer(){
  const wanted=timerActive()?"timer":watch?"dial":"empty";
  if(wanted!==watchMode){renderWatchSlot();return;}
  if(wanted==="timer")updateWatchCountdown();
}
function watchTick(){
  if(watchMode==="timer")updateWatchCountdown();
  const a=angles();
  document.querySelectorAll(".watch-hands").forEach(svg=>{
    const hour=svg.querySelector(".wh-hour"),minute=svg.querySelector(".wh-min"),second=svg.querySelector(".wh-sec");
    if(hour)hour.setAttribute("transform",`rotate(${a.h})`);
    if(minute)minute.setAttribute("transform",`rotate(${a.m})`);
    if(second)second.setAttribute("transform",`rotate(${a.s})`);
  });
}

/* --- Editor --- */
function draftConfig(){
  if(!wDraft)return null;
  if(watchTab==="photo")return wDraft.img||wDraft.image?{kind:"photo",image:wDraft.image||"",dial:wDraft.dial}:null;
  return{kind:"preset",dial:wDraft.dial};
}
function renderWatchPreview(){
  const box=$("watchPreview");if(!box)return;box.replaceChildren();
  const dial=dialNode({kind:"preset",dial:wDraft.dial},"preview-dial");
  dial.appendChild(handsSvg(wDraft.hands,wDraft.style));box.appendChild(dial);watchTick();
}
function renderCropHands(){
  const box=$("cropHands");if(!box)return;box.replaceChildren();
  box.appendChild(handsSvg(wDraft.hands,wDraft.style));watchTick();
}
function renderDialGrid(){
  const box=$("dialGrid");if(!box)return;box.replaceChildren();
  DIAL_PRESETS.forEach(preset=>{
    const choice=el("button","dial-choice"+(wDraft.dial===preset.id?" on":""));choice.type="button";
    choice.setAttribute("aria-label",preset.name+" dial");choice.title=preset.name;
    const face=el("span","dial-thumb");face.appendChild(dialSvg(preset));
    choice.append(face,el("small","",preset.name));
    choice.addEventListener("click",()=>{wDraft.dial=preset.id;renderDialGrid();renderWatchPreview();$("watchMsg").textContent=preset.name+" selected.";});
    box.appendChild(choice);
  });
}
function renderHandStyles(){
  const box=$("handStyles");if(!box)return;box.replaceChildren();
  HAND_STYLES.forEach(([id,name])=>{
    const choice=el("button","hand-choice"+(wDraft.style===id?" on":""));choice.type="button";
    choice.setAttribute("aria-label",name+" hands");choice.title=name+" hands";
    const svg=svgNode("svg",{viewBox:"-50 -50 100 100",class:"hand-preview","aria-hidden":"true"});
    svg.appendChild(svgNode("circle",{r:48,fill:"#0d1420",stroke:"#2b3648","stroke-width":2}));
    const hour=svgNode("g",{transform:"rotate(300)"}),minute=svgNode("g",{transform:"rotate(60)"});
    hour.appendChild(handShape(id,25,3.4,wDraft.hands));minute.appendChild(handShape(id,37,2.5,wDraft.hands));
    svg.append(hour,minute,svgNode("circle",{r:2.5,fill:wDraft.hands}));
    choice.append(svg,el("small","",name));
    choice.addEventListener("click",()=>{wDraft.style=id;renderHandStyles();renderWatchPreview();renderCropHands();});
    box.appendChild(choice);
  });
}
function renderSwatches(){
  const box=$("watchColors");if(!box)return;box.replaceChildren();
  HAND_COLOURS.forEach(([colour,name])=>{
    const swatch=el("button","swatch"+(wDraft.hands===colour?" on":""));swatch.type="button";
    swatch.style.background=colour;swatch.title=name+" hands";swatch.setAttribute("aria-label",name+" hands");
    swatch.addEventListener("click",()=>{wDraft.hands=colour;renderSwatches();renderHandStyles();renderWatchPreview();renderCropHands();});
    box.appendChild(swatch);
  });
}
function setWatchTab(tab){
  watchTab=tab;
  $("watchPresetPane").hidden=tab!=="preset";
  $("watchPhotoPane").hidden=tab!=="photo";
  $("watchPreview").hidden=tab!=="preset";
  $("watchCropWrap").hidden=tab!=="photo";
  [...$("watchTabs").children].forEach(b=>b.classList.toggle("on",b.dataset.wtab===tab));
  if(tab==="photo"){drawWatchPreview();renderCropHands();}else renderWatchPreview();
}
const wScale=()=>WD/Math.min(wDraft.img.width,wDraft.img.height)*wDraft.zoom;
function drawWatchPreview(){
  const canvas=$("watchCanvas");if(!canvas)return;
  const c=canvas.getContext("2d");c.clearRect(0,0,WC,WC);c.fillStyle="#0d1420";c.fillRect(0,0,WC,WC);
  if(!wDraft||!wDraft.img){
    c.fillStyle="#8b97a8";c.font="12px 'DM Mono',monospace";c.textAlign="center";
    c.fillText("Choose a watch photo to begin",WC/2,WC/2);return;
  }
  const s=wScale(),w=wDraft.img.width*s,h=wDraft.img.height*s;
  c.drawImage(wDraft.img,WC/2-w/2+wDraft.ox,WC/2-h/2+wDraft.oy,w,h);
  c.save();c.fillStyle="rgba(5,8,14,.74)";c.beginPath();c.rect(0,0,WC,WC);c.moveTo(WC/2+WD/2,WC/2);c.arc(WC/2,WC/2,WD/2,0,Math.PI*2);c.fill("evenodd");c.restore();
  c.strokeStyle="#56b5ff";c.lineWidth=2;c.beginPath();c.arc(WC/2,WC/2,WD/2,0,Math.PI*2);c.stroke();
}
function openWatchDialog(){
  wDraft={img:null,image:watch&&watch.kind==="photo"?watch.image:"",zoom:1,ox:0,oy:0,
    dial:watch&&watch.kind==="preset"?watch.dial:DIAL_PRESETS[0].id,
    style:watch?watch.style:"baton",hands:watch?watch.hands:"#ffffff"};
  $("watchZoom").value=1;$("watchMsg").textContent="";$("watchRemove").hidden=!watch;
  renderDialGrid();renderHandStyles();renderSwatches();
  setWatchTab(watch&&watch.kind==="photo"?"photo":"preset");
  if(watch&&watch.kind==="photo"){const image=new Image();image.onload=()=>{if(wDraft){wDraft.img=image;drawWatchPreview();}};image.src=watch.image;}
  $("watchDialog").showModal();
}
$("watchSlot").addEventListener("click",openWatchDialog);
[...$("watchTabs").children].forEach(b=>b.addEventListener("click",()=>setWatchTab(b.dataset.wtab)));
$("watchFile").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];e.target.value="";if(!file||!wDraft)return;
  if(!/^image\//.test(file.type)){$("watchMsg").textContent="Please choose an image file.";return;}
  const url=URL.createObjectURL(file),image=new Image();
  image.onload=()=>{wDraft.img=image;wDraft.zoom=1;wDraft.ox=wDraft.oy=0;$("watchZoom").value=1;URL.revokeObjectURL(url);
    $("watchMsg").textContent="Drag to centre the dial, then zoom until it fills the circle.";drawWatchPreview();};
  image.onerror=()=>{$("watchMsg").textContent="That image could not be read.";URL.revokeObjectURL(url);};
  image.src=url;
});
$("watchZoom").addEventListener("input",()=>{if(wDraft&&wDraft.img){wDraft.zoom=Number($("watchZoom").value);drawWatchPreview();}});
const wc=$("watchCanvas");
wc.addEventListener("pointerdown",e=>{if(!wDraft||!wDraft.img)return;wDrag={x:e.clientX,y:e.clientY,ox:wDraft.ox,oy:wDraft.oy};wc.setPointerCapture(e.pointerId);});
wc.addEventListener("pointermove",e=>{if(!wDrag)return;const k=WC/wc.getBoundingClientRect().width;wDraft.ox=wDrag.ox+(e.clientX-wDrag.x)*k;wDraft.oy=wDrag.oy+(e.clientY-wDrag.y)*k;drawWatchPreview();});
["pointerup","pointercancel"].forEach(t=>wc.addEventListener(t,()=>{wDrag=null;}));
wc.addEventListener("wheel",e=>{if(!wDraft||!wDraft.img)return;e.preventDefault();const z=$("watchZoom");z.value=Math.min(6,Math.max(1,Number(z.value)-e.deltaY*.002));wDraft.zoom=Number(z.value);drawWatchPreview();},{passive:false});
$("watchCancel").addEventListener("click",()=>$("watchDialog").close());
$("watchRemove").addEventListener("click",()=>{try{localStorage.removeItem(WATCH_KEY);}catch{}watch=null;renderWatchSlot();$("watchDialog").close();});
$("watchSave").addEventListener("click",()=>{
  let next;
  if(watchTab==="preset")next={kind:"preset",dial:wDraft.dial,style:wDraft.style,hands:wDraft.hands};
  else{
    if(!wDraft.img){
      if(wDraft.image)next={kind:"photo",image:wDraft.image,style:wDraft.style,hands:wDraft.hands};
      else{$("watchMsg").textContent="Choose a photo, or switch to the preset dials.";return;}
    }else{
      const out=document.createElement("canvas");out.width=out.height=360;
      const c=out.getContext("2d"),f=360/WD,scale=wScale()*f,w=wDraft.img.width*scale,h=wDraft.img.height*scale;
      c.fillStyle="#0d1420";c.fillRect(0,0,360,360);c.drawImage(wDraft.img,180-w/2+wDraft.ox*f,180-h/2+wDraft.oy*f,w,h);
      next={kind:"photo",image:out.toDataURL("image/jpeg",.88),style:wDraft.style,hands:wDraft.hands};
    }
  }
  if(!writeStorage(WATCH_KEY,next)){$("watchMsg").textContent="Could not save: browser storage is full.";return;}
  watch=next;renderWatchSlot();$("watchDialog").close();
});
watchReady=true;renderWatchSlot();setInterval(watchTick,250);

/* 11. APEX ALERTS — in-page toast, browser notification and a soft chime.
   Works offline. Browser notifications need the page served over http(s). */
let notifyPrefs=readStorage(STORAGE_KEYS.notify,{sound:true});
if(!notifyPrefs||typeof notifyPrefs!=="object")notifyPrefs={sound:true};
const saveNotifyPrefs=()=>writeStorage(STORAGE_KEYS.notify,notifyPrefs);
let audioContext=null;
function primeAudio(){ if(audioContext)return; try{ audioContext=new (window.AudioContext||window.webkitAudioContext)(); }catch{ audioContext=null; } }
document.addEventListener("pointerdown",primeAudio,{once:true});
function chime(tones=2){
  if(!notifyPrefs.sound)return; primeAudio(); if(!audioContext)return;
  if(audioContext.state==="suspended")audioContext.resume();
  const t0=audioContext.currentTime;
  for(let i=0;i<tones;i++){
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=t0+i*0.42;
    osc.type="sine"; osc.frequency.value=i%2?988:784;
    gain.gain.setValueAtTime(0.0001,at);
    gain.gain.exponentialRampToValueAtTime(0.2,at+0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001,at+0.34);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(at); osc.stop(at+0.36);
  }
}
function toast(title,body,category){
  const host=$("toastHost"); if(!host)return;
  const card=el("div","toast cat-"+(category||"other"));
  const copy=el("div","toast-copy"); copy.appendChild(el("strong","",title));
  if(body)copy.appendChild(el("span","",body));
  const close=el("button","toast-x","\u00d7"); close.type="button";
  close.addEventListener("click",()=>card.remove());
  card.append(copy,close); host.appendChild(card);
  setTimeout(()=>{card.classList.add("is-leaving");setTimeout(()=>card.remove(),400);},9000);
}
function apexNotify(title,body,category){
  toast(title,body,category);
  try{ if(notifySupport()==="granted") new Notification(title,{body:body||"",tag:"apex-"+Date.now()}); }catch{}
  chime();
}
function notifySupport(){ try{ if(typeof Notification==="undefined"||!Notification||typeof Notification.permission!=="string")return "unsupported"; return Notification.permission; }catch{ return "unsupported"; } }
function updateNotifyUI(){
  const status=$("notifStatus"); if(!status)return;
  const state=notifySupport(),enable=$("notifEnable");
  const text={ unsupported:"This browser cannot show system notifications. APEX will still pop an on-screen alert and play a sound.",
    granted:"System notifications are ON. Alerts appear even when this tab is in the background.",
    denied:"System notifications are blocked in your browser settings. On-screen alerts and sound still work.",
    default:"System notifications are off. Turn them on to be alerted when this tab is in the background." };
  status.textContent=text[state]||text.default;
  if(enable)enable.hidden=(state==="granted"||state==="unsupported");
  const sound=$("notifSound"); if(sound)sound.checked=!!notifyPrefs.sound;
}
if($("notifEnable"))$("notifEnable").addEventListener("click",async()=>{
  primeAudio();
  if(notifySupport()==="unsupported"){updateNotifyUI();return;}
  try{ await Notification.requestPermission(); }
  catch{ $("notifStatus").textContent="Your browser refused the request. This usually happens when the page is opened straight from a file. Serve the folder over http://localhost to enable system notifications."; return; }
  updateNotifyUI();
});
if($("notifTest"))$("notifTest").addEventListener("click",()=>{primeAudio();apexNotify("Test alert","This is exactly how an event reminder will look and sound.","study");});
if($("notifSound"))$("notifSound").addEventListener("change",e=>{notifyPrefs.sound=e.target.checked;saveNotifyPrefs();if(e.target.checked)chime(1);});

/* 12. DAY PLANNER — events, Google-Calendar-style day and week grids, reminders.
   Storage key: apexEvents. */
const HOUR_HEIGHT=52, ALERT_WINDOW=150000;
const CATEGORY_NAMES={study:"Study",class:"Class / School",fitness:"Fitness",exam:"Exam / Deadline",personal:"Personal",other:"Other"};
let events=readStorage(STORAGE_KEYS.events,[]);
if(!Array.isArray(events))events=[];
events=events.filter(e=>e&&e.id&&e.title&&e.date&&e.start);
let calView="day",calCursor=new Date(),calMonth=new Date(),editingEventId=null;
calCursor.setHours(12,0,0,0); calMonth.setDate(1); calMonth.setHours(12,0,0,0);
const saveEvents=()=>writeStorage(STORAGE_KEYS.events,events);
const eventId=()=>"event-"+Date.now()+"-"+Math.random().toString(16).slice(2);
function minutesOf(time){const [h,m]=String(time||"0:0").split(":").map(Number);return (h||0)*60+(m||0);}
function minutesToTime(mins){return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;}
function endMinutes(ev){const s=minutesOf(ev.start);return ev.end?Math.max(minutesOf(ev.end),s+15):s+60;}
function eventStartDate(ev){const [y,m,d]=ev.date.split("-").map(Number);return new Date(y,(m||1)-1,d||1,Math.floor(minutesOf(ev.start)/60),minutesOf(ev.start)%60,0,0);}
function timeRange(ev){return `${ev.start}\u2013${minutesToTime(Math.min(24*60-1,endMinutes(ev)))}`;}
function hourLabel(h){return String(h).padStart(2,"0")+":00";}
function eventsOn(key){return events.filter(e=>e.date===key).sort((a,b)=>minutesOf(a.start)-minutesOf(b.start));}
function calDays(){ return calView==="day" ? [localDateKey(calCursor)] : Array.from({length:7},(_,i)=>localDateKey(addDays(mondayOf(calCursor),i))); }
function calLabel(){
  if(calView==="day")return calCursor.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const keys=calDays(),a=dateFromKey(keys[0]),b=dateFromKey(keys[6]);
  return `${a.toLocaleDateString("en-IN",{day:"numeric",month:"short"})} \u2013 ${b.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}`;
}
function shiftCal(step){calCursor=addDays(calCursor,calView==="day"?step:step*7);calMonth=new Date(calCursor.getFullYear(),calCursor.getMonth(),1,12);renderCalendar();}

function layoutEvents(items){
  const out=[]; let cluster=[],clusterEnd=-1;
  const flush=()=>{
    if(!cluster.length)return;
    const columnEnds=[];
    cluster.forEach(item=>{let c=0;while(columnEnds[c]!==undefined&&columnEnds[c]>item.s)c++;columnEnds[c]=item.e;item.col=c;});
    cluster.forEach(item=>item.cols=columnEnds.length);
    out.push(...cluster); cluster=[];
  };
  items.forEach(item=>{ if(cluster.length&&item.s>=clusterEnd){flush();clusterEnd=-1;} cluster.push(item); clusterEnd=Math.max(clusterEnd,item.e); });
  flush(); return out;
}
function eventBlock(item){
  const ev=item.ev,node=el("button","cal-event cat-"+(ev.category||"other"));
  node.type="button";
  node.style.top=(item.s/60*HOUR_HEIGHT)+"px";
  node.style.height=Math.max(21,(item.e-item.s)/60*HOUR_HEIGHT-3)+"px";
  node.style.left=`calc(${item.col/item.cols*100}% + 2px)`;
  node.style.width=`calc(${100/item.cols}% - 5px)`;
  node.append(el("strong","",ev.title),el("span","",calView==="week"?ev.start:timeRange(ev)));
  if(ev.notes&&(item.e-item.s)>=45)node.appendChild(el("small","",ev.notes));
  node.title=`${timeRange(ev)} \u2014 ${ev.title}${ev.notes?"\n"+ev.notes:""}`;
  node.addEventListener("click",e=>{e.stopPropagation();editEvent(ev.id);});
  return node;
}
function buildColumn(key){
  const col=el("div","cal-col"+(key===localDateKey()?" is-today":""));
  col.dataset.date=key; col.style.height=(24*HOUR_HEIGHT)+"px";
  const items=eventsOn(key).map(ev=>({ev,s:minutesOf(ev.start),e:Math.min(24*60,endMinutes(ev))}));
  layoutEvents(items).forEach(item=>col.appendChild(eventBlock(item)));
  if(key===localDateKey()){const line=el("div","cal-now");line.appendChild(el("i","cal-now-dot"));col.appendChild(line);}
  col.addEventListener("click",e=>{
    if(e.target.closest(".cal-event"))return;
    const rect=col.getBoundingClientRect(),raw=(e.clientY-rect.top)/HOUR_HEIGHT*60;
    prefillEvent(key,Math.max(0,Math.min(23*60+45,Math.floor(raw/15)*15)));
  });
  return col;
}
function renderCalToolbar(){
  const box=$("calToolbar"); if(!box)return; box.replaceChildren();
  const nav=el("div","cal-nav");
  nav.append(btn("\u2039","secondary",()=>shiftCal(-1)),
    btn("TODAY","secondary",()=>{calCursor=new Date();calCursor.setHours(12,0,0,0);calMonth=new Date(calCursor.getFullYear(),calCursor.getMonth(),1,12);renderCalendar();}),
    btn("\u203a","secondary",()=>shiftCal(1)));
  const seg=el("div","seg");
  [["day","DAY"],["week","WEEK"]].forEach(([value,label])=>seg.appendChild(btn(label,"secondary"+(calView===value?" on":""),()=>{calView=value;renderCalendar();})));
  box.append(nav,el("strong","cal-label",calLabel()),seg);
}
function renderCalGrid(){
  const box=$("calGrid"); if(!box)return; box.replaceChildren();
  const keys=calDays(),today=localDateKey(),columns=`58px repeat(${keys.length},minmax(0,1fr))`;
  const head=el("div","cal-head"); head.appendChild(el("div","cal-corner",""));
  keys.forEach(key=>{
    const date=dateFromKey(key),cell=el("div","cal-dayhead"+(key===today?" is-today":""));
    cell.append(el("span","cal-dow",DAYS[(date.getDay()+6)%7]),el("strong","cal-dnum",String(date.getDate())));
    head.appendChild(cell);
  });
  const body=el("div","cal-body"),gutter=el("div","cal-gutter");
  for(let h=0;h<24;h++){const row=el("div","cal-hourlabel");row.appendChild(el("span","",hourLabel(h)));gutter.appendChild(row);}
  body.appendChild(gutter);
  keys.forEach(key=>body.appendChild(buildColumn(key)));
  head.style.gridTemplateColumns=columns; body.style.gridTemplateColumns=columns;
  if(calView==="week")box.classList.add("is-week"); else box.classList.remove("is-week");
  box.append(head,body); updateNowLine();
  const starts=keys.flatMap(k=>eventsOn(k).map(e=>Math.floor(minutesOf(e.start)/60)));
  const focusHour=starts.length?Math.min(...starts):(keys.includes(today)?new Date().getHours():8);
  requestAnimationFrame(()=>{box.scrollTop=Math.max(0,(focusHour-1)*HOUR_HEIGHT);});
}
function updateNowLine(){
  const now=new Date(),top=(now.getHours()*60+now.getMinutes())/60*HOUR_HEIGHT;
  document.querySelectorAll(".cal-now").forEach(line=>{line.style.top=top+"px";});
}
function renderMiniMonth(){
  const box=$("calMini"); if(!box)return; box.replaceChildren();
  const nav=el("div","mini-nav");
  nav.append(btn("\u2039","secondary",()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1,12);renderMiniMonth();}),
    el("strong","",calMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"}).toUpperCase()),
    btn("\u203a","secondary",()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1,12);renderMiniMonth();}));
  const grid=el("div","mini-grid");
  DAYS.forEach(day=>grid.appendChild(el("span","mini-dow",day[0])));
  for(let i=0;i<(calMonth.getDay()+6)%7;i++)grid.appendChild(el("span","mini-blank"));
  const days=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,0).getDate(),selected=localDateKey(calCursor),today=localDateKey();
  for(let d=1;d<=days;d++){
    const key=localDateKey(new Date(calMonth.getFullYear(),calMonth.getMonth(),d,12));
    const cell=btn(String(d),"mini-day"+(key===selected?" is-selected":"")+(key===today?" is-today":""),()=>{
      calCursor=dateFromKey(key); renderCalendar();
    });
    if(eventsOn(key).length)cell.appendChild(el("i","mini-dot"));
    grid.appendChild(cell);
  }
  box.append(nav,grid);
}
function renderUpcoming(){
  const box=$("calUpcoming"); if(!box)return; box.replaceChildren();
  const now=Date.now();
  const list=events.map(ev=>({ev,at:eventStartDate(ev).getTime()})).filter(x=>x.at>=now-60000).sort((a,b)=>a.at-b.at).slice(0,6);
  if(!list.length){box.appendChild(el("p","empty-state","Nothing scheduled ahead. Click any time slot to add an event."));return;}
  list.forEach(({ev,at})=>{
    const row=el("button","up-row cat-"+(ev.category||"other"));row.type="button";
    const when=dateFromKey(ev.date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});
    row.append(el("strong","",ev.title),el("span","",`${when} \u00b7 ${timeRange(ev)}`),el("small","",countdownLabel(at)));
    row.addEventListener("click",()=>{calCursor=dateFromKey(ev.date);calMonth=new Date(calCursor.getFullYear(),calCursor.getMonth(),1,12);renderCalendar();});
    box.appendChild(row);
  });
}
function countdownLabel(at){
  const diff=at-Date.now();
  if(diff<0)return "happening now";
  const mins=Math.round(diff/60000);
  if(mins<60)return `in ${mins} min`;
  const hours=Math.floor(mins/60);
  if(hours<24)return `in ${hours} h ${mins%60} min`;
  return `in ${Math.round(hours/24)} day${Math.round(hours/24)===1?"":"s"}`;
}
function updateHomeNext(){
  const box=$("homeNext"); if(!box)return;
  const now=Date.now();
  const next=events.map(ev=>({ev,at:eventStartDate(ev).getTime()})).filter(x=>x.at>=now-60000).sort((a,b)=>a.at-b.at)[0];
  if(!next){box.hidden=true;box.textContent="";return;}
  const day=next.ev.date===localDateKey()?"TODAY":dateFromKey(next.ev.date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
  box.hidden=false; box.textContent=`NEXT UP \u00b7 ${day} ${next.ev.start} \u2014 ${next.ev.title} (${countdownLabel(next.at)})`;
}

/* Event form: doubles as the editor */
function resetEventForm(){
  editingEventId=null;
  if(!$("eventForm"))return;
  $("eventForm").reset();
  $("evDate").value=localDateKey(calCursor);
  $("evStart").value="";$("evEnd").value="";
  $("evRemind").value="10";
  $("eventFormTitle").textContent="ADD AN EVENT";
  $("evSave").textContent="ADD EVENT";
  $("evCancel").hidden=true;$("evDelete").hidden=true;
}
function prefillEvent(dateKey,minutes){
  resetEventForm();
  $("evDate").value=dateKey;
  $("evStart").value=minutesToTime(minutes);
  $("evEnd").value=minutesToTime(Math.min(23*60+59,minutes+60));
  $("evMsg").textContent="";
  $("evTitle").focus();
  if(window.innerWidth<=950)$("eventForm").scrollIntoView({behavior:"smooth",block:"center"});
}
function editEvent(id){
  const ev=events.find(e=>e.id===id); if(!ev)return;
  editingEventId=id;
  $("evTitle").value=ev.title;$("evDate").value=ev.date;$("evStart").value=ev.start;
  $("evEnd").value=ev.end||"";$("evCategory").value=ev.category||"other";
  $("evRemind").value=String(ev.remind||0);$("evNotes").value=ev.notes||"";
  $("eventFormTitle").textContent="EDIT EVENT";
  $("evSave").textContent="SAVE CHANGES";
  $("evCancel").hidden=false;$("evDelete").hidden=false;
  $("evMsg").textContent="";
  $("eventForm").scrollIntoView({behavior:"smooth",block:"center"});
}
if($("eventForm"))$("eventForm").addEventListener("submit",e=>{
  e.preventDefault(); primeAudio();
  const title=$("evTitle").value.trim(),date=$("evDate").value,start=$("evStart").value,end=$("evEnd").value;
  if(!title){$("evMsg").textContent="Give the event a title.";return;}
  if(!date||!start){$("evMsg").textContent="Pick a date and a start time.";return;}
  if(end&&minutesOf(end)<=minutesOf(start)){$("evMsg").textContent="The end time must be after the start time.";return;}
  const payload={title,date,start,end,category:$("evCategory").value,remind:Number($("evRemind").value)||0,
    notes:$("evNotes").value.trim(),notifiedRemind:false,notifiedStart:false};
  if(editingEventId){
    const ev=events.find(x=>x.id===editingEventId);
    if(ev)Object.assign(ev,payload);
    $("evMsg").textContent="Event updated.";
  }else{
    events.push({id:eventId(),createdAt:new Date().toISOString(),...payload});
    $("evMsg").textContent="Event added. You will be alerted when it is due.";
  }
  saveEvents(); calCursor=dateFromKey(date); calMonth=new Date(calCursor.getFullYear(),calCursor.getMonth(),1,12);
  const message=$("evMsg").textContent; resetEventForm(); $("evMsg").textContent=message;
  renderCalendar(); checkEventAlerts();
});
if($("evCancel"))$("evCancel").addEventListener("click",()=>{resetEventForm();$("evMsg").textContent="";});
if($("evDelete"))$("evDelete").addEventListener("click",()=>{
  if(!editingEventId)return;
  const ev=events.find(x=>x.id===editingEventId);
  if(!ev||!confirm(`Delete \u201c${ev.title}\u201d permanently?`))return;
  events=events.filter(x=>x.id!==editingEventId);
  saveEvents(); resetEventForm(); $("evMsg").textContent="Event deleted."; renderCalendar();
});

function renderCalendar(){
  if(!$("calGrid"))return;
  renderCalToolbar(); renderCalGrid(); renderMiniMonth(); renderUpcoming(); updateNotifyUI(); updateHomeNext();
  if(!editingEventId&&!$("evDate").value)$("evDate").value=localDateKey(calCursor);
}

/* Reminder scheduler */
function checkEventAlerts(){
  const now=Date.now(); let changed=false;
  events.forEach(ev=>{
    const start=eventStartDate(ev).getTime(),lead=Number(ev.remind||0)*60000;
    if(lead>0&&!ev.notifiedRemind){
      const at=start-lead;
      if(now>=at&&now<at+ALERT_WINDOW){ev.notifiedRemind=true;changed=true;
        apexNotify(`In ${ev.remind} minutes \u2014 ${ev.title}`,`${timeRange(ev)}${ev.notes?" \u00b7 "+ev.notes:""}`,ev.category);}
      else if(now>=at+ALERT_WINDOW){ev.notifiedRemind=true;changed=true;}
    }
    if(!ev.notifiedStart){
      if(now>=start&&now<start+ALERT_WINDOW){ev.notifiedStart=true;changed=true;
        apexNotify(`Starting now \u2014 ${ev.title}`,`${timeRange(ev)}${ev.notes?" \u00b7 "+ev.notes:""}`,ev.category);}
      else if(now>=start+ALERT_WINDOW){ev.notifiedStart=true;changed=true;}
    }
  });
  if(changed)saveEvents();
  updateHomeNext(); updateNowLine();
}
setInterval(checkEventAlerts,15000);
setInterval(()=>{if($("calGrid")&&!$("calGrid").hidden)renderUpcoming();},60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkEventAlerts();});
resetEventForm(); updateNotifyUI(); checkEventAlerts(); renderCalendar();


/* 13. APEX GARAGE — a 2026-spec Formula 1 challenger you can spin through 360°.
   Original APEX-liveried model, drawn by a small software 3D renderer on canvas:
   no libraries, no image files, works offline. Axes: +X rear, +Y up, +Z right. */
const CAR_COLOURS={
  body:"#1e3666",bodyDark:"#15274a",bodyTop:"#24417a",accent:"#e02633",accentDark:"#a81c27",accent2:"#2f5fae",
  carbon:"#1a1f29",wing:"#121c2e",floor:"#101827",tyre:"#15181f",tyreWall:"#ef3340",rim:"#9aa6b6",halo:"#0b1018",cockpit:"#070a10"
};
const CAR_PARTS=[
  ["frontwing","FRONT WING","The front wing meets the air first. It sets up the airflow for everything behind it, and teams change its flaps to trade front grip against straight-line speed."],
  ["nose","NOSE & CHASSIS","The survival cell is a carbon-fibre tub built to take an impact without deforming. The nose ahead of it is a crash structure designed to crush in stages."],
  ["halo","HALO","A titanium hoop above the cockpit, mandatory in F1 since 2018. It must survive loads of roughly 15 tonnes pushing down on it."],
  ["sidepod","SIDEPODS","The sidepods feed the radiators and shape the air heading to the rear. Their inlets and undercuts are among the most redesigned parts of a modern car."],
  ["floor","FLOOR & DIFFUSER","Under the current ground-effect rules most of the downforce comes from the floor: air accelerates through the venturi tunnels and expands out of the diffuser."],
  ["rearwing","REAR WING","The rear wing balances the car against the front. Its upper flap opens in designated zones to cut drag and help overtaking."],
  ["tyres","TYRES","Slick tyres on 18-inch rims. Compound choice and keeping them inside their working temperature decides most of a race strategy."]
];
let carYaw=0.62,carPitch=0.28,carZoom=1,carSpin=true,carBlueprint=false,carPart="",carDrag=null,carVel=0,carTween=null,carNeedsDraw=true;

/* --- geometry helpers: every part is a list of flat polygons --- */
function faceBox(x1,x2,y1,y2,z1,z2,colour,part){
  const v=[[x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1],[x1,y1,z2],[x2,y1,z2],[x2,y2,z2],[x1,y2,z2]];
  return [[0,1,2,3],[5,4,7,6],[4,5,1,0],[3,2,6,7],[4,0,3,7],[1,5,6,2]].map(i=>({v:i.map(k=>v[k]),c:colour,p:part}));
}
function faceTaper(x1,w1,y1a,y1b,x2,w2,y2a,y2b,colour,part){
  const f=[[x1,y1a,-w1],[x1,y1a,w1],[x1,y1b,w1],[x1,y1b,-w1]],b=[[x2,y2a,-w2],[x2,y2a,w2],[x2,y2b,w2],[x2,y2b,-w2]];
  return [[f[0],f[1],f[2],f[3]],[b[3],b[2],b[1],b[0]],[f[0],b[0],b[1],f[1]],[f[3],f[2],b[2],b[3]],[f[0],f[3],b[3],b[0]],[f[1],b[1],b[2],f[2]]].map(v=>({v,c:colour,p:part}));
}
function faceBar(p1,p2,thickness,colour,part){
  const d=[p2[0]-p1[0],p2[1]-p1[1],p2[2]-p1[2]],len=Math.hypot(d[0],d[1],d[2])||1;
  const dir=[d[0]/len,d[1]/len,d[2]/len];
  let up=Math.abs(dir[1])>.9?[1,0,0]:[0,1,0];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l];};
  const u=norm(cross(dir,up)),v=norm(cross(dir,u)),h=thickness/2;
  const corner=(p,su,sv)=>[p[0]+u[0]*su*h+v[0]*sv*h,p[1]+u[1]*su*h+v[1]*sv*h,p[2]+u[2]*su*h+v[2]*sv*h];
  const a=[corner(p1,1,1),corner(p1,-1,1),corner(p1,-1,-1),corner(p1,1,-1)];
  const b=[corner(p2,1,1),corner(p2,-1,1),corner(p2,-1,-1),corner(p2,1,-1)];
  return [[a[0],a[1],b[1],b[0]],[a[1],a[2],b[2],b[1]],[a[2],a[3],b[3],b[2]],[a[3],a[0],b[0],b[3]],[a[3],a[2],a[1],a[0]],[b[0],b[1],b[2],b[3]]]
    .map(pts=>({v:pts,c:colour,p:part}));
}
function faceWheel(cx,cy,cz,r,halfWidth,part){
  const out=[],segments=26,sign=cz>0?1:-1,outer=cz+sign*halfWidth,inner=cz-sign*halfWidth;
  const ring=(radius,z)=>{const pts=[];for(let i=0;i<segments;i++){const a=i/segments*2*Math.PI;pts.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,z]);}return pts;};
  for(let i=0;i<segments;i++){
    const a1=i/segments*2*Math.PI,a2=(i+1)/segments*2*Math.PI,point=(a,z)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r,z];
    out.push({v:[point(a1,inner),point(a2,inner),point(a2,outer),point(a1,outer)],c:CAR_COLOURS.tyre,p:part,e:0});
  }
  out.push({v:ring(r*.995,inner),c:"#101319",p:part,e:0});
  out.push({v:ring(r*.995,outer),c:"#1b2027",p:part,e:0});
  out.push({v:ring(r*.90,outer+sign*.005),c:CAR_COLOURS.tyreWall,p:part,e:0});
  out.push({v:ring(r*.80,outer+sign*.010),c:"#1a1e26",p:part,e:0});
  out.push({v:ring(r*.60,outer+sign*.015),c:CAR_COLOURS.rim,p:part,e:0});
  out.push({v:ring(r*.33,outer+sign*.020),c:"#5d6a7a",p:part,e:0});
  out.push({v:ring(r*.12,outer+sign*.025),c:CAR_COLOURS.accent,p:part,e:0});
  return out;
}
function buildCar(){
  const C=CAR_COLOURS,f=[];
  /* --- front wing: four stacked elements, staggered rearward --- */
  [[.030,.050,.95,C.wing],[.062,.082,.95,C.carbon],[.098,.120,.93,C.wing],[.136,.158,.86,C.wing]].forEach(([y1,y2,w,colour],i)=>{
    f.push(...faceBox(-2.70+i*.05,-2.30+i*.07,y1,y2,-w,w,colour,"frontwing"));
  });
  [-1,1].forEach(side=>{
    f.push(...faceBox(-2.74,-2.22,.02,.26,side*.95,side*1.0,C.carbon,"frontwing"));
    f.push(...faceBox(-2.74,-2.22,.26,.30,side*.945,side*1.0,C.accent,"frontwing"));
    f.push(...faceBar([-2.52,.17,side*.16],[-2.18,.30,side*.17],.07,C.carbon,"frontwing"));
  });
  /* --- nose, monocoque, cockpit --- */
  f.push(...faceTaper(-2.26,.07,.16,.28,-1.62,.17,.13,.40,C.body,"nose"));
  f.push(...faceTaper(-1.62,.17,.13,.40,-.80,.30,.11,.50,C.body,"nose"));
  f.push(...faceTaper(-.80,.30,.11,.50,.05,.38,.11,.56,C.bodyDark,"nose"));
  f.push(...faceBox(-2.0,-1.75,.27,.31,-.20,.20,C.accent,"nose"));
  f.push(...faceBox(-.46,.16,.50,.54,-.24,.24,C.cockpit,"nose"));
  f.push(...faceTaper(.16,.30,.40,.56,.34,.26,.40,.62,C.body,"nose"));
  /* --- halo: front pillar plus a sloping hoop --- */
  f.push(...faceBar([-.54,.50,0],[-.54,.80,0],.075,C.halo,"halo"));
  const haloPoint=(a,side,lift)=>[-.12+Math.cos(a)*.44,.80-.17*Math.pow(a/Math.PI,1.4)+(lift||0),side*Math.sin(a)*.33];
  for(let i=0;i<12;i++){
    const a1=i/12*Math.PI,a2=(i+1)/12*Math.PI;
    [-1,1].forEach(side=>{
      f.push({v:[haloPoint(a1,side),haloPoint(a2,side),haloPoint(a2,side,.05),haloPoint(a1,side,.05)],c:C.halo,p:"halo",e:0});
      const inset=(p)=>[p[0],p[1],p[2]*.86];
      f.push({v:[haloPoint(a1,side,.05),haloPoint(a2,side,.05),inset(haloPoint(a2,side,.05)),inset(haloPoint(a1,side,.05))],c:"#161c26",p:"halo",e:0});
    });
  }
  /* --- airbox and engine cover, with a spine that follows the roofline --- */
  f.push(...faceTaper(.20,.24,.54,.74,.46,.28,.50,.92,C.bodyDark,"nose"));
  f.push(...faceTaper(.46,.28,.30,.92,1.25,.24,.26,.70,C.body,"nose"));
  f.push(...faceTaper(1.25,.24,.24,.70,2.02,.10,.22,.42,C.bodyDark,"nose"));
  f.push(...faceTaper(.52,.042,.845,.90,1.25,.038,.645,.70,C.accentDark,"nose"));
  f.push(...faceTaper(1.25,.038,.645,.70,1.95,.032,.385,.43,C.accentDark,"nose"));
  /* --- sidepods: inlet, body, undercut and coke-bottle taper --- */
  [-1,1].forEach(side=>{
    f.push(...faceBox(-.38,-.30,.20,.52,side*.44,side*.84,C.carbon,"sidepod"));
    f.push(...faceBox(-.32,1.18,.17,.52,side*.42,side*.86,C.body,"sidepod"));
    f.push(...faceTaper(1.18,.22,.19,.50,1.98,.07,.21,.40,C.bodyDark,"sidepod").map(face=>({...face,v:face.v.map(p=>[p[0],p[1],side*(p[2]+.42)])})));
    f.push(...faceBox(.18,.78,.29,.41,side*.865,side*.882,C.accent2,"sidepod"));
    f.push(...faceBox(-.30,1.15,.50,.53,side*.46,side*.78,C.bodyDark,"sidepod"));
  });
  /* --- floor, tunnels and diffuser --- */
  f.push(...faceBox(-1.40,1.98,.035,.09,-.86,.86,C.floor,"floor"));
  [-1,1].forEach(side=>f.push(...faceBox(-1.34,1.92,.09,.16,side*.50,side*.84,C.carbon,"floor")));
  f.push(...faceTaper(1.98,.84,.035,.13,2.40,.70,.15,.36,C.carbon,"floor"));
  for(let i=-2;i<=2;i++)f.push(...faceBox(1.99,2.39,.07,.34,i*.25-.018,i*.25+.018,C.floor,"floor"));
  /* --- rear wing and crash structure --- */
  f.push(...faceBox(1.92,2.42,.26,.40,-.085,.085,C.bodyDark,"rearwing"));
  f.push(...faceBar([2.0,.44,0],[2.14,.86,0],.09,C.carbon,"rearwing"));
  f.push(...faceBox(2.14,2.50,.86,.925,-.50,.50,C.wing,"rearwing"));
  f.push(...faceBox(2.22,2.52,.705,.765,-.49,.49,C.accent,"rearwing"));
  f.push(...faceBox(2.18,2.46,.325,.375,-.44,.44,C.carbon,"rearwing"));
  [-1,1].forEach(side=>{
    f.push(...faceBox(2.08,2.54,.30,.96,side*.50,side*.545,C.carbon,"rearwing"));
    f.push(...faceBox(2.46,2.54,.30,.96,side*.495,side*.55,C.accent,"rearwing"));
  });
  /* --- wheels and suspension --- */
  [[-1.66,-1],[-1.66,1],[1.60,-1],[1.60,1]].forEach(([x,side])=>{
    const rear=x>0,radius=rear?.40:.355,halfWidth=rear?.215:.17,z=side*(rear?.74:.76);
    f.push(...faceWheel(x,radius,z,radius,halfWidth,"tyres"));
    const hub=[x,radius,side*(rear?.52:.56)],body=rear?.26:.22;
    f.push(...faceBar(hub,[x+(rear?-.42:.40),radius*.92,side*body],.055,C.carbon,"tyres"));
    f.push(...faceBar(hub,[x+(rear?-.30:.28),radius*.46,side*body],.05,C.carbon,"tyres"));
    f.push(...faceBar([x,radius*1.35,z-side*halfWidth],[x+(rear?-.34:.32),radius*1.35,side*(body+.02)],.045,C.carbon,"tyres"));
    f.push(...faceBox(x-.26,x+.26,radius*1.78,radius*1.96,side*(rear?.48:.52),side*(rear?.96:.94),C.carbon,"tyres"));
  });
  return f;
}
const CAR_MESH=buildCar();

/* --- renderer --- */
function shadeColour(hex,amount){
  const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
  return `rgb(${clamp(r*amount)},${clamp(g*amount)},${clamp(b*amount)})`;
}
function drawCar(){
  const canvas=$("garageCanvas");if(!canvas)return;
  const ctx=canvas.getContext("2d"),ratio=Math.min(2,window.devicePixelRatio||1);
  const width=canvas.clientWidth||640,height=canvas.clientHeight||340;
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);}
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const cy=Math.cos(carYaw),sy=Math.sin(carYaw),cp=Math.cos(carPitch),sp=Math.sin(carPitch);
  const scale=Math.min(width/6.0,height/2.7)*carZoom,originX=width/2,originY=height/2+height*.13,depth=11;
  const toView=p=>{
    const x=p[0]*cy+p[2]*sy,zr=-p[0]*sy+p[2]*cy,y=p[1]-.44;
    return[x,y*cp-zr*sp,y*sp+zr*cp];
  };
  const project=v=>{const k=depth/(depth-v[2]);return[originX+v[0]*scale*k,originY-v[1]*scale*k];};
  const faces=[];
  for(const face of CAR_MESH){
    const view=face.v.map(toView);
    let z=0;for(const v of view)z+=v[2];
    faces.push({view,z:z/view.length,c:face.c,p:face.p});
  }
  faces.sort((a,b)=>a.z-b.z);
  const light=[-.38,.72,.58];
  for(const face of faces){
    const [a,b,c]=face.view;
    const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const len=Math.hypot(n[0],n[1],n[2])||1;n=[n[0]/len,n[1]/len,n[2]/len];
    if(n[2]<0)n=[-n[0],-n[1],-n[2]];
    const lambert=Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
    const dim=carPart&&carPart!==face.p;
    ctx.beginPath();
    const points=face.view.map(project);
    ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();
    if(carBlueprint){
      ctx.strokeStyle=dim?"rgba(86,181,255,.14)":carPart===face.p?"rgba(239,51,64,.85)":"rgba(86,181,255,.5)";
      ctx.lineWidth=.7;ctx.stroke();
    }else{
      ctx.fillStyle=shadeColour(face.c,(.52+lambert*.72)*(dim?.42:1));
      ctx.fill();
      if(face.e!==0||carPart===face.p){
        ctx.strokeStyle=carPart===face.p?"rgba(239,51,64,.9)":"rgba(0,0,0,.32)";
        ctx.lineWidth=carPart===face.p?1.1:.5;ctx.stroke();
      }
    }
  }
  if(!carBlueprint){
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle="#000";ctx.beginPath();
    ctx.ellipse(originX,originY+scale*.46,scale*1.5,scale*.17,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  const label=$("garageAngle");
  if(label)label.textContent=`YAW ${String(Math.round((carYaw*180/Math.PI%360+360)%360)).padStart(3,"0")}° · PITCH ${String(Math.round(carPitch*180/Math.PI)).padStart(2,"0")}° · ZOOM ${carZoom.toFixed(1)}×`;
}
function carFrame(){
  const home=$("homePage");
  if(home&&!home.hidden&&!document.hidden){
    let moved=false;
    if(carTween){
      carTween.t=Math.min(1,carTween.t+.045);
      const e=1-Math.pow(1-carTween.t,3);
      carYaw=carTween.y0+(carTween.y1-carTween.y0)*e;
      carPitch=carTween.p0+(carTween.p1-carTween.p0)*e;
      if(carTween.t>=1)carTween=null;
      moved=true;
    }else if(Math.abs(carVel)>.0002){carYaw+=carVel;carVel*=.95;moved=true;}
    else if(carSpin&&!carDrag){carYaw+=.0055;moved=true;}
    /* idle frames cost nothing: the canvas is only repainted when something changes */
    if(moved||carNeedsDraw){carNeedsDraw=false;drawCar();}
  }
  requestAnimationFrame(carFrame);
}
function setCarView(yaw,pitch){carTween={y0:carYaw,y1:yaw,p0:carPitch,p1:pitch,t:0};carVel=0;}
function renderGarageControls(){
  const views=$("garageViews");
  if(views){
    views.replaceChildren();
    [["3/4",0.62,0.28],["FRONT",Math.PI/2,0.16],["SIDE",0,0.1],["REAR",-Math.PI/2,0.16],["TOP",0.62,1.17]].forEach(([label,yaw,pitch])=>
      views.appendChild(btn(label,"secondary",()=>setCarView(yaw,pitch))));
  }
  const parts=$("garageParts");
  if(parts){
    parts.replaceChildren();
    CAR_PARTS.forEach(([id,label,text])=>{
      const button=btn(label,"secondary"+(carPart===id?" on":""),()=>{
        carPart=carPart===id?"":id;renderGarageControls();
        $("garageCaption").textContent=carPart?text:"Drag the car to look all the way around it.";
        drawCar();
      });
      parts.appendChild(button);
    });
  }
}
if($("garageCanvas")){
  const canvas=$("garageCanvas");
  canvas.addEventListener("pointerdown",e=>{carDrag={x:e.clientX,y:e.clientY};carVel=0;carTween=null;canvas.setPointerCapture(e.pointerId);canvas.classList.add("is-dragging");});
  canvas.addEventListener("pointermove",e=>{
    if(!carDrag)return;
    const dx=(e.clientX-carDrag.x)*.009,dy=(e.clientY-carDrag.y)*.006;
    carYaw+=dx;carPitch=Math.max(-.35,Math.min(1.3,carPitch+dy));carVel=dx*.55;carDrag={x:e.clientX,y:e.clientY};drawCar();
  });
  ["pointerup","pointercancel","pointerleave"].forEach(type=>canvas.addEventListener(type,()=>{carDrag=null;canvas.classList.remove("is-dragging");}));
  canvas.addEventListener("wheel",e=>{e.preventDefault();carZoom=Math.max(.6,Math.min(2.6,carZoom-e.deltaY*.0012));drawCar();},{passive:false});
  canvas.addEventListener("dblclick",()=>{carZoom=1;setCarView(0.62,0.28);});
  $("garageSpin").addEventListener("click",()=>{carSpin=!carSpin;$("garageSpin").classList.toggle("on",carSpin);});
  $("garageBlueprint").addEventListener("click",()=>{carBlueprint=!carBlueprint;$("garageBlueprint").classList.toggle("on",carBlueprint);drawCar();});
  window.addEventListener("resize",()=>{carNeedsDraw=true;});
  renderGarageControls();drawCar();requestAnimationFrame(carFrame);
}

/* 9. STARTUP */
initialiseStudyDatabase();
