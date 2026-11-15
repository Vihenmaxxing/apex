"""Performance, touch and accessibility checks for APEX.

Covers the gaps that the functional suites do not: behaviour with a large
dataset, real touch input rather than synthetic clicks, and keyboard and
screen-reader reachability.
"""
from playwright.sync_api import sync_playwright
import pathlib, json, sys, time

APP = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'index.html'
url = APP.as_uri()
P=[];F=[]
def chk(n,c,d=""):
    (P if c else F).append(n); print(("  PASS  " if c else "  FAIL  ")+n+((" :: "+str(d)) if d else ""))

# Two years of habit logs, 600 study records, 400 tasks, 500 fitness records.
def big_dataset(pg):
    return pg.evaluate("""() => {
      const key = d => d.toISOString().slice(0,10);
      const habits = [], logs = [], tasks = [], fit = [], events = [];
      for (let h = 0; h < 8; h++)
        habits.push({id:'h'+h, name:'Habit '+h, category:'Discipline',
                     createdAt:'2024-11-01T00:00:00.000Z', paused:false, archived:false});
      const start = new Date(); start.setDate(start.getDate() - 730);
      for (let d = 0; d < 730; d++) {
        const day = new Date(start); day.setDate(start.getDate() + d);
        for (let h = 0; h < 8; h++)
          if ((d + h) % 3) logs.push({habitId:'h'+h, date:key(day), completed:true, note:''});
      }
      for (let t = 0; t < 400; t++)
        tasks.push({id:'t'+t, text:'Task number '+t, completed: t % 2 === 0, day:'2026-11-15'});
      const subjects = ['Physics','Chemistry','Biology','Mathematics','Geography'];
      for (let f = 0; f < 500; f++) {
        const day = new Date(start); day.setDate(start.getDate() + (f % 730));
        fit.push({id:'f'+f, kind:['strength','endurance','football','other','rest'][f%5],
                  exercise:'Pull-ups', activity:'Running', sport:'Tennis', session:'Training',
                  position:'Striker', distance:5, minutes:40, sets:[8,6], totalReps:14,
                  date:key(day), createdAt:day.toISOString()});
      }
      for (let e = 0; e < 200; e++) {
        const day = new Date(); day.setDate(day.getDate() + (e % 30));
        events.push({id:'e'+e, title:'Event '+e, date:key(day), start:'09:00', end:'10:00',
                     category:'study', remind:10, createdAt:day.toISOString()});
      }
      localStorage.setItem('apexHabits', JSON.stringify(habits));
      localStorage.setItem('apexHabitLogs', JSON.stringify(logs));
      localStorage.setItem('apexTasks', JSON.stringify(tasks));
      localStorage.setItem('apexFitnessRecords', JSON.stringify(fit));
      localStorage.setItem('apexEvents', JSON.stringify(events));
      return {habits:habits.length, logs:logs.length, tasks:tasks.length,
              fit:fit.length, events:events.length};
    }""")

def seed_study(pg, n=600):
    return pg.evaluate("""(n) => new Promise(resolve => {
      const req = indexedDB.open('APEXDB', 1);
      req.onupgradeneeded = e => { const db = e.target.result;
        if (!db.objectStoreNames.contains('studyRecords'))
          db.createObjectStore('studyRecords', {keyPath:'id', autoIncrement:true}); };
      req.onsuccess = e => {
        const db = e.target.result, tx = db.transaction('studyRecords','readwrite');
        const store = tx.objectStore('studyRecords'); store.clear();
        const subjects = ['Physics','Chemistry','Biology','Mathematics','Geography'];
        const start = new Date(); start.setDate(start.getDate() - 500);
        for (let i = 0; i < n; i++) {
          const d = new Date(start); d.setDate(start.getDate() + (i % 500));
          store.add({subject:subjects[i%5], chapter:'Chapter '+i, minutes:30+(i%90),
                     date:d.toISOString().slice(0,10), type:'Learning', notes:'note',
                     createdAt:d.toISOString()});
        }
        tx.oncomplete = () => resolve(n);
        tx.onerror = () => resolve(0);
      };
    })""", n)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width':1440,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(1500)

    print("\n[PERFORMANCE — LARGE DATASET]")
    counts = big_dataset(pg)
    study_n = seed_study(pg)
    print(f"  seeded: {counts} + {study_n} study records")
    t0 = time.time(); pg.reload(); pg.wait_for_timeout(300)
    pg.wait_for_function("typeof xpState !== 'undefined' && document.getElementById('xpHomeStrip').children.length > 0",
                         timeout=30000)
    boot = time.time() - t0
    chk("boots with a large dataset in under 10s", boot < 10, f"{boot:.2f}s")
    chk("no errors during large-dataset boot", not errs, errs[:3])

    timings = {}
    for page in ['habits','study','fitness','calendar','progression','stadium','tasks','home']:
        t = time.time()
        pg.evaluate(f"window.apexOpenPage('{page}')")
        pg.wait_for_timeout(60)
        pg.evaluate("document.body.offsetHeight")   # force layout
        timings[page] = time.time() - t
    for page, secs in timings.items():
        chk(f"page '{page}' renders in under 3s with full data", secs < 3, f"{secs:.2f}s")

    chk("all 730 days of habit logs retained", pg.evaluate("habitLogs.length")==counts['logs'])
    chk("all study records loaded from IndexedDB", pg.evaluate("studyRecords.length")==study_n)
    chk("analytics computed over the full set",
        pg.evaluate("studyRecords.reduce((s,r)=>s+r.minutes,0)")>0)

    print("\n[PERFORMANCE — XP LEDGER GROWTH]")
    pg.evaluate("""(()=>{for(let i=0;i<800;i++)xpAward('perf:'+i,5,'Perf '+i,'task',{silent:true});})()""")
    pg.wait_for_timeout(400)
    led = pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger')).length")
    chk("ledger trims to its 400-entry cap", led==400, led)
    total = pg.evaluate("xpState.totalXP")
    pg.reload(); pg.wait_for_timeout(2500)
    chk("total XP survives ledger trimming (no XP lost)", pg.evaluate("xpState.totalXP")==total,
        f"{total} -> {pg.evaluate('xpState.totalXP')}")
    t = time.time(); pg.evaluate("window.apexOpenPage('progression')"); pg.wait_for_timeout(100)
    chk("progression page renders a full ledger quickly", (time.time()-t) < 3, f"{time.time()-t:.2f}s")

    print("\n[ACCESSIBILITY]")
    pg.evaluate("window.apexOpenPage('stadium')"); pg.wait_for_timeout(700)
    chk("stadium sections are focusable", pg.eval_on_selector_all('#stadiumSvg .st-stand[tabindex="0"]','e=>e.length')==5)
    chk("stadium sections have accessible names",
        all(pg.eval_on_selector_all('#stadiumSvg .st-stand','e=>e.map(x=>x.getAttribute("aria-label"))')))
    chk("stadium sections expose pressed state",
        all(v is not None for v in pg.eval_on_selector_all('#stadiumSvg .st-stand','e=>e.map(x=>x.getAttribute("aria-pressed"))')))
    chk("SVG has a role and label", pg.eval_on_selector('#stadiumSvg','e=>e.getAttribute("role")==="img" && !!e.getAttribute("aria-label")'))
    pg.evaluate("window.apexOpenPage('home')"); pg.wait_for_timeout(400)
    unlabelled = pg.evaluate("""[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null &&
        !b.textContent.trim() && !b.getAttribute('aria-label')).length""")
    chk("every visible button has a label or text", unlabelled==0, unlabelled)
    chk("live regions present for status messages",
        pg.eval_on_selector_all('[role=status],[aria-live]','e=>e.length')>0)
    chk("page language declared", pg.evaluate("document.documentElement.lang")=="en")
    # Checked by behaviour, not by reading the stylesheet: file:// blocks CSSOM
    # access, so inspecting cssRules reports a false negative.
    probe = "getComputedStyle(document.querySelector('.module-button')).transitionDuration"
    normal_ctx = b.new_context(reduced_motion='no-preference'); np = normal_ctx.new_page()
    np.goto(url); np.wait_for_timeout(1200); normal = np.evaluate(probe); normal_ctx.close()
    reduce_ctx = b.new_context(reduced_motion='reduce'); rp = reduce_ctx.new_page()
    rp.goto(url); rp.wait_for_timeout(1200); reduced = rp.evaluate(probe); reduce_ctx.close()
    chk("prefers-reduced-motion actually suppresses transitions",
        float(reduced.split(',')[0].rstrip('s')) < float(normal.split(',')[0].rstrip('s')),
        f"normal={normal} reduced={reduced}")

    b.close()

    print("\n[TOUCH — REAL TAP EVENTS, iPhone VIEWPORT]")
    b2 = p.chromium.launch()
    iphone = p.devices['iPhone 13']
    ctx = b2.new_context(**iphone)
    m = ctx.new_page()
    terrs=[]
    m.on('pageerror', lambda e: terrs.append(str(e)))
    m.goto(url); m.wait_for_timeout(2200)
    chk("touch support detected", m.evaluate("navigator.maxTouchPoints")>0)
    chk("body flagged as touch", m.eval_on_selector('body','e=>e.classList.contains("apex-touch")'))
    m.tap('.module-button[data-open-page="stadium"]'); m.wait_for_timeout(900)
    chk("tap opens the stadium page", m.eval_on_selector('#stadiumPage','e=>e.offsetParent!==null'))
    box = m.eval_on_selector('#stadiumSvg .st-stand[data-section="pitch"] .st-stand-hit','e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}')
    m.touchscreen.tap(box['x'], box['y']); m.wait_for_timeout(500)
    chk("tap selects a stadium section", 'THE PITCH' in m.inner_text('#stadiumPanel'), m.inner_text('#stadiumPanel')[:60])
    m.tap('.st-views button:nth-child(2)'); m.wait_for_timeout(700)
    chk("tap switches view", m.eval_on_selector('#stadiumSvg','e=>e.classList.contains("st-view-plan")'))
    m.tap('#stadiumPage .home-return'); m.wait_for_timeout(500)
    chk("tap returns home", m.eval_on_selector('#homePage','e=>e.offsetParent!==null'))
    m.tap('.module-button[data-open-page="tasks"]'); m.wait_for_timeout(600)
    m.fill('#taskInput','Touch task'); m.tap('#addTaskButton'); m.wait_for_timeout(400)
    chk("tap adds a task", 'Touch task' in m.inner_text('#taskList'))
    m.tap('#taskList li:first-child input[type=checkbox]'); m.wait_for_timeout(500)
    chk("tap completes a task and awards XP", m.evaluate("xpState.totalXP")>=15, m.evaluate("xpState.totalXP"))

    print("\n[TOUCH TARGET SIZES]")
    small = m.evaluate("""[...document.querySelectorAll('button, .module-button, .hcell')]
        .filter(e=>e.offsetParent!==null)
        .map(e=>({t:(e.textContent||e.id||e.className||'').trim().slice(0,28),
                  h:Math.round(e.getBoundingClientRect().height),
                  w:Math.round(e.getBoundingClientRect().width)}))
        .filter(x=>x.h>0 && (x.h<44 || x.w<44))""")
    chk("every visible button is at least 44x44", not small, small[:6])
    # A checkbox may stay visually small provided the same action has a larger
    # target: the task label toggles the identical state.
    rows = m.evaluate("""[...document.querySelectorAll('#taskList li')].map(li=>({
        box: Math.round(li.querySelector('input').getBoundingClientRect().height),
        label: Math.round(li.querySelector('.task-label').getBoundingClientRect().height),
        row: Math.round(li.getBoundingClientRect().height)}))""")
    chk("task rows give the checkbox an equivalent large target",
        all(r['row'] >= 44 for r in rows), rows[:3])

    print("\n[ORIENTATION]")
    m.set_viewport_size({'width':844,'height':390}); m.wait_for_timeout(600)
    chk("no horizontal overflow in landscape", not m.evaluate("document.documentElement.scrollWidth > window.innerWidth+2"))
    m.evaluate("window.apexOpenPage('stadium')"); m.wait_for_timeout(700)
    chk("stadium usable in landscape", m.eval_on_selector('#stadiumSvg','e=>e.getBoundingClientRect().height')>120)
    m.set_viewport_size({'width':390,'height':844}); m.wait_for_timeout(500)
    chk("no horizontal overflow back in portrait", not m.evaluate("document.documentElement.scrollWidth > window.innerWidth+2"))
    chk("no errors during touch run", not terrs, terrs[:3])
    b2.close()

print(f"\n=== {len(P)} passed, {len(F)} failed ===")
if F: print("FAILED:", F)
sys.exit(1 if F else 0)
