from playwright.sync_api import sync_playwright
import pathlib, json, sys
APP = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'index.html'
url = APP.as_uri()
P=[];F=[]
def chk(n,c,d=""):
    (P if c else F).append(n); print(("  PASS  " if c else "  FAIL  ")+n+((" :: "+str(d)) if d else ""))
def fresh(pg):
    pg.evaluate("localStorage.clear()"); 
    pg.evaluate("indexedDB.deleteDatabase('APEXDB')")

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(1500)

    print("\n[PENALTIES — missed habits/tasks punished, rest days never]")
    fresh(pg)
    days = pg.evaluate("""(()=>{const o=[];for(let i=1;i<=4;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);o.push(localDateKey(d));}return o;})()""")
    pg.evaluate("""d=>{
      localStorage.setItem('apexHabits',JSON.stringify([{id:'h1',name:'Read',category:'Mental',createdAt:'2026-01-01T00:00:00.000Z',paused:false,archived:false}]));
      localStorage.setItem('apexHabitLogs',JSON.stringify([]));
      localStorage.setItem('apexFitnessRecords',JSON.stringify([{id:'r1',kind:'rest',date:d[1],createdAt:'2026-01-01T00:00:00.000Z'}]));
      localStorage.setItem('apexXPState',JSON.stringify({v:1,totalXP:500,settings:{penalties:true},awarded:{},seeded:true}));
    }""", days)
    pg.reload(); pg.wait_for_timeout(2600)
    led=pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger')||'[]')")
    misses=[t for t in led if t['source']=='missed']
    missdays=sorted(t['key'].split(':')[-1] for t in misses)
    chk("missed habit days are penalised", len(misses)>0, len(misses))
    chk("each penalty is -5 XP", all(t['amount']==-5 for t in misses))
    chk("the logged REST DAY is never penalised", days[1] not in missdays, f"rest={days[1]} penalised={missdays}")
    chk("other recent days are penalised", days[0] in missdays and days[2] in missdays, missdays)
    chk("today is never penalised", pg.evaluate("localDateKey()") not in missdays)
    t1=pg.evaluate("xpState.totalXP")
    pg.reload(); pg.wait_for_timeout(2600)
    chk("penalties do not repeat on reload", pg.evaluate("xpState.totalXP")==t1, f"{t1} -> {pg.evaluate('xpState.totalXP')}")
    chk("penalty toggle off stops further penalties",
        pg.evaluate("""(()=>{xpState.settings.penalties=false;return xpPenalise('miss:habit:zz:2026-01-01',5,'x','missed')===0;})()"""))
    pg.evaluate("xpState.settings.penalties=true")

    print("\n[XP CAN NEVER GO NEGATIVE]")
    pg.evaluate("""xpState.totalXP=3;xpSaveState()""")
    pg.evaluate("""xpPenalise('miss:habit:neg:2026-01-02',5,'test','missed')""")
    chk("total XP floors at 0, never negative", pg.evaluate("xpState.totalXP")==0, pg.evaluate("xpState.totalXP"))
    chk("level never drops below 1", pg.evaluate("xpProgress(0).level")==1)

    print("\n[DAILY STUDY CAP — long days logged in full, but stop paying]")
    fresh(pg); pg.reload(); pg.wait_for_timeout(2500)
    pg.evaluate("window.apexOpenPage('study')"); pg.wait_for_timeout(400)
    gains=[]
    for mins in [240,60,60,60]:
        before=pg.evaluate("xpState.totalXP")
        pg.fill('#studyChapter',f'Block {mins}-{len(gains)}'); pg.fill('#studyDuration',str(mins))
        pg.click('#addStudyButton'); pg.wait_for_timeout(800)
        gains.append(pg.evaluate("xpState.totalXP")-before)
    chk("first 4h earns full rate (160 XP)", gains[0]==160, gains)
    chk("4h-5h earns half rate (20 XP)", gains[1]==20, gains)
    chk("5h-6h earns half rate (20 XP)", gains[2]==20, gains)
    chk("beyond 6h earns 0 XP", gains[3]==0, gains)
    chk("all 4 records still saved in full", pg.evaluate("studyRecords.length")==4)
    chk("over-cap record still appears in analytics", pg.inner_text('#totalStudyTime')=="7h 0m", pg.inner_text('#totalStudyTime'))

    print("\n[FOCUS TIMER AWARDS XP ON COMPLETION]")
    fresh(pg); pg.reload(); pg.wait_for_timeout(2500)
    pg.evaluate("window.apexOpenPage('study')"); pg.wait_for_timeout(400)
    before=pg.evaluate("xpState.totalXP"); s_before=pg.evaluate("sessions")
    pg.evaluate("""(()=>{remainingTime=600;totalDuration=1800000;endTime=Date.now()+200;timerRunning=true;startTimer();})()""")
    pg.wait_for_timeout(1500)
    chk("focus session awards 10 XP", pg.evaluate("xpState.totalXP")-before==10, f"{before}->{pg.evaluate('xpState.totalXP')}")
    chk("session counter still increments (existing behaviour)", pg.evaluate("sessions")==s_before+1)
    chk("duration pre-filled into logger (existing behaviour)", pg.input_value('#studyDuration')=="30", pg.input_value('#studyDuration'))
    led=pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger'))")
    chk("focus txn recorded in ledger", any(t['source']=='focus' for t in led))

    print("\n[CORRUPTED / MISSING XP DATA HANDLED]")
    for label, state, ledger in [
        ("garbage JSON", "{not json", "also not json"),
        ("wrong types", json.dumps({"totalXP":"abc","awarded":[1,2],"settings":"x"}), json.dumps("nope")),
        ("null", "null", "null"),
        ("negative total", json.dumps({"v":1,"totalXP":-9999,"awarded":{},"seeded":True}), json.dumps([])),
        ("missing keys", None, None),
    ]:
        pg.evaluate("localStorage.clear()")
        if state is not None:
            pg.evaluate("([s,l])=>{localStorage.setItem('apexXPState',s);localStorage.setItem('apexXPLedger',l)}",[state,ledger])
        errs.clear()
        pg.reload(); pg.wait_for_timeout(2500)
        ok = (not errs) and pg.evaluate("Number.isFinite(xpState.totalXP) && xpState.totalXP>=0") and pg.eval_on_selector('#xpHomeStrip','e=>e.children.length>0')
        chk(f"recovers from {label}", ok, errs or pg.evaluate("xpState.totalXP"))

    print("\n[LEDGER REBUILD FROM TRANSACTIONS]")
    pg.evaluate("localStorage.clear()")
    pg.evaluate("""localStorage.setItem('apexXPLedger',JSON.stringify([
      {id:'a',key:'task:1',amount:15,reason:'Task',source:'task',at:'2026-11-14T10:00:00.000Z'},
      {id:'b',key:'habit:x:2026-11-14',amount:10,reason:'Habit',source:'habit',at:'2026-11-14T11:00:00.000Z'}]));
      localStorage.setItem('apexXPState',JSON.stringify({v:1,totalXP:'corrupt',awarded:{'task:1':1,'habit:x:2026-11-14':1},seeded:true}))""")
    pg.reload(); pg.wait_for_timeout(2500)
    chk("total rebuilt from ledger when corrupted", pg.evaluate("xpState.totalXP")==25, pg.evaluate("xpState.totalXP"))

    print("\n[RESET XP ONLY — other data untouched]")
    pg.evaluate("localStorage.clear()")
    pg.evaluate("""localStorage.setItem('apexTasks',JSON.stringify([{id:'t1',text:'keep me',completed:true,day:'2026-11-15'}]));
      localStorage.setItem('apexHabits',JSON.stringify([{id:'h9',name:'Keep',createdAt:'2026-11-01T00:00:00Z'}]))""")
    pg.reload(); pg.wait_for_timeout(2500)
    pg.evaluate("window.apexOpenPage('progression')"); pg.wait_for_timeout(500)
    pg.evaluate("window.confirm=()=>true")
    pg.evaluate("""[...document.querySelectorAll('#xpRoot button')].find(b=>b.textContent.includes('RESET XP')).click()""")
    pg.wait_for_timeout(500)
    chk("XP reset to 0", pg.evaluate("xpState.totalXP")==0)
    chk("ledger cleared", pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger')).length")==0)
    chk("tasks survive XP reset", pg.evaluate("JSON.parse(localStorage.getItem('apexTasks'))[0].text")=="keep me")
    chk("habits survive XP reset", pg.evaluate("JSON.parse(localStorage.getItem('apexHabits'))[0].name")=="Keep")

    chk("no errors in edge-case run", not errs, errs)
    print(f"\n=== {len(P)} passed, {len(F)} failed ===")
    if F: print("FAILED:",F)
    b.close()

import sys
sys.exit(1 if F else 0)
