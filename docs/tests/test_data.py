from playwright.sync_api import sync_playwright
import pathlib, json, sys
APP = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'index.html'
url = APP.as_uri()
P=[];F=[]
def chk(n,c,d=""):
    (P if c else F).append(n); print(("  PASS  " if c else "  FAIL  ")+n+((" :: "+str(d)) if d else ""))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)

    print("\n[12] EXISTING v4.6 DATA SURVIVES THE UPGRADE")
    pg.goto(url); pg.wait_for_timeout(1500)
    # Write authentic v4.6-shaped data (pre-XP: tasks have NO id)
    legacy = {
      'apexTasks': [{"text":"Old task done","completed":True},{"text":"Old task open","completed":False}],
      'apexSessions': 12,
      'apexHabits': [{"id":"habit-old-1","name":"Old habit","category":"Discipline","createdAt":"2026-10-01T10:00:00.000Z","paused":False,"archived":False}],
      'apexHabitLogs': [{"habitId":"habit-old-1","date":"2026-10-02","completed":True,"note":""},
                        {"habitId":"habit-old-1","date":"2026-10-03","completed":True,"note":""}],
      'apexFitnessRecords': [{"id":"fitness-old-1","kind":"strength","exercise":"Pull-ups","date":"2026-10-05","sets":[8,6],"totalReps":14,"createdAt":"2026-10-05T10:00:00.000Z"},
                             {"id":"fitness-old-2","date":"2026-09-01","category":"Strength","activity":"Push-ups","minutes":30}],
      'apexEvents': [{"id":"event-old-1","title":"Physics tuition","date":"2026-12-01","start":"17:00","end":"18:00","category":"study","remind":10}],
      'apexQuoteLibrary': [{"text":"Work beats talent","author":"APEX"}],
      'apexNotifyPrefs': {"sound": False},
      'apexWatch': {"kind":"preset","dial":"sunburst","hands":"#ffffff","style":"baton"},
      'apexTimerState': {"running":False,"remainingTime":0,"totalDuration":2700000,"endTime":0,"selectedHours":0,"selectedMinutes":45,"selectedSeconds":0}
    }
    for k,v in legacy.items():
        pg.evaluate("([k,v])=>localStorage.setItem(k,JSON.stringify(v))",[k,v])
    pg.evaluate("""localStorage.removeItem('apexXPState');localStorage.removeItem('apexXPLedger')""")
    pg.reload(); pg.wait_for_timeout(2600)

    after = {k: pg.evaluate("k=>JSON.parse(localStorage.getItem(k))",k) for k in legacy}
    chk("apexSessions unchanged", after['apexSessions']==12, after['apexSessions'])
    chk("apexHabits unchanged", after['apexHabits']==legacy['apexHabits'])
    chk("apexHabitLogs unchanged", after['apexHabitLogs']==legacy['apexHabitLogs'])
    chk("apexFitnessRecords unchanged (incl. v4.1 legacy record)", after['apexFitnessRecords']==legacy['apexFitnessRecords'])
    chk("apexEvents unchanged", after['apexEvents']==legacy['apexEvents'])
    chk("apexQuoteLibrary unchanged", after['apexQuoteLibrary']==legacy['apexQuoteLibrary'])
    chk("apexNotifyPrefs unchanged", after['apexNotifyPrefs']==legacy['apexNotifyPrefs'])
    chk("apexWatch unchanged", after['apexWatch']==legacy['apexWatch'])
    tks=after['apexTasks']
    chk("task text preserved", [t['text'] for t in tks]==["Old task done","Old task open"], tks)
    chk("task completed state preserved", [t['completed'] for t in tks]==[True,False])
    chk("migration added ids to old tasks", all(t.get('id') for t in tks))
    chk("migration added day stamp = today (no false 'missed')",
        all(t.get('day')==pg.evaluate("localDateKey()") for t in tks))

    print("\n[LEGACY CREDIT — one-time, capped, idempotent]")
    led=pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger'))")
    seed=[t for t in led if t['key']=='seed:legacy']
    chk("exactly one legacy credit transaction", len(seed)==1, [t['key'] for t in led])
    # 1 task*15 + 2 habitlogs*10 + 2 fitness (strength25 + other20) + 12 sessions*10 = 15+20+45+120 = 200
    chk("legacy credit = 200 XP as computed from existing data", seed and seed[0]['amount']==200, seed[0]['amount'] if seed else None)
    chk("historical completions marked counted, not re-awardable",
        pg.evaluate("""xpHasKey('task:'+tasks[0].id) && xpHasKey('habit:habit-old-1:2026-10-02') && xpHasKey('fitness:fitness-old-1')"""))
    t1=pg.evaluate("JSON.parse(localStorage.getItem('apexXPState')).totalXP")
    pg.reload(); pg.wait_for_timeout(2600)
    t2=pg.evaluate("JSON.parse(localStorage.getItem('apexXPState')).totalXP")
    led2=pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger'))")
    chk("legacy credit does NOT repeat on reload", t1==t2 and len([t for t in led2 if t['key']=='seed:legacy'])==1, f"{t1} -> {t2}")
    chk("re-completing a pre-existing completed task awards nothing",
        pg.evaluate("""(()=>{const before=xpState.totalXP;const cb=document.querySelectorAll('#taskList li input')[0];cb.click();cb.click();return xpState.totalXP===before;})()"""))

    print("\n[1] EXISTING MODULES STILL FUNCTION")
    pg.evaluate("window.apexOpenPage('habits')"); pg.wait_for_timeout(600)
    chk("habit week table renders", pg.eval_on_selector_all('#habWeek .hcell','e=>e.length')==7)
    chk("habit analytics renders 4 cards", pg.eval_on_selector_all('#habAnalytics .hab-grid > .card','e=>e.length')==4)
    chk("habit manage list renders", pg.eval_on_selector_all('#habList .record-row','e=>e.length')==1)
    pg.evaluate("window.apexOpenPage('calendar')"); pg.wait_for_timeout(600)
    chk("calendar grid renders", pg.eval_on_selector('#calGrid','e=>e.children.length>0'))
    chk("calendar upcoming shows saved event", 'Physics tuition' in pg.inner_text('#calUpcoming'))
    pg.evaluate("window.apexOpenPage('fitness')"); pg.wait_for_timeout(600)
    for tab in ['STRENGTH','ENDURANCE','FOOTBALL','OTHER SPORTS','OVERVIEW']:
        pg.evaluate(f"""[...document.querySelectorAll('#fitRoot .fit-tabs button')].find(x=>x.textContent==='{tab}').click()""")
        pg.wait_for_timeout(250)
        chk(f"fitness tab {tab} renders", pg.eval_on_selector('.fit-panel','e=>e.children.length>0'))
    chk("v4.1 legacy fitness record still listed", 'v4.1 record' in pg.inner_text('#fitRoot'))
    pg.evaluate("window.apexOpenPage('study')"); pg.wait_for_timeout(700)
    chk("study analytics charts render", pg.eval_on_selector_all('#subjectChart,#weeklyChart,#distributionChart,#heatmap','e=>e.every(x=>x.children.length>0||x.textContent.trim())'))
    chk("focus timer wheels render", pg.eval_on_selector_all('#hoursWheel .wheel-option','e=>e.length')==24)
    chk("timer duration restored from saved state", pg.inner_text('#timerDisplay')=="00:45:00", pg.inner_text('#timerDisplay'))
    pg.evaluate("window.apexOpenPage('home')"); pg.wait_for_timeout(800)
    chk("daily quote shown from library", 'Work beats talent' in pg.inner_text('#dailyQuote'), pg.inner_text('#dailyQuote'))
    chk("garage canvas present", pg.eval_on_selector('#garageCanvas','e=>e.width>0'))
    chk("watch slot renders saved watch", pg.eval_on_selector('#watchSlot','e=>e.children.length>0'))

    print("\n[2] HOME SCREEN PRESERVED")
    order = pg.eval_on_selector_all('#homePage > *','e=>e.map(x=>x.className||x.tagName)')
    chk("home order: top, XP strip, quote, modules, garage",
        order==['home-top','card xp-strip','quote-card card','module-grid','card garage-card'], order)
    tiles = pg.eval_on_selector_all('.module-button','e=>e.map(x=>x.dataset.openPage)')
    chk("all 5 original module tiles intact, in their original order",
        tiles[:5]==['study','tasks','fitness','calendar','habits'], tiles)
    chk("5.0 adds progression and stadium tiles only",
        tiles[5:]==['progression','stadium'], tiles)
    chk("XP strip is one compact row (<=130px tall)", pg.eval_on_selector('#xpHomeStrip','e=>e.getBoundingClientRect().height')<=130,
        pg.eval_on_selector('#xpHomeStrip','e=>Math.round(e.getBoundingClientRect().height)'))

    chk("no errors", not errs, errs)
    print(f"\n=== {len(P)} passed, {len(F)} failed ===")
    if F: print("FAILED:",F)
    b.close()

import sys
sys.exit(1 if F else 0)
