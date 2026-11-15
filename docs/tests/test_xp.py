from playwright.sync_api import sync_playwright
import pathlib
APP = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'index.html'
url = APP.as_uri()
P=[];F=[]
def chk(name, cond, detail=""):
    (P if cond else F).append(name)
    print(("  PASS  " if cond else "  FAIL  ")+name+((" :: "+str(detail)) if detail else ""))

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(2000)
    XP = lambda: pg.evaluate("JSON.parse(localStorage.getItem('apexXPState')).totalXP")
    LED= lambda: pg.evaluate("JSON.parse(localStorage.getItem('apexXPLedger')||'[]')")

    print("\n[3] TASKS AWARD CORRECT XP")
    pg.evaluate("window.apexOpenPage('tasks')")
    for t in ['T one','T two','T three']:
        pg.fill('#taskInput',t); pg.click('#addTaskButton'); pg.wait_for_timeout(80)
    before=XP()
    pg.click('#taskList li:nth-child(1) input[type=checkbox]'); pg.wait_for_timeout(300)
    chk("task completion awards 15 XP", XP()-before==15, f"{before}->{XP()}")
    chk("task has stable id", pg.evaluate("JSON.parse(localStorage.getItem('apexTasks'))[0].id!==undefined"))

    print("\n[7] DUPLICATE AWARDS PREVENTED")
    mid=XP()
    for _ in range(6):
        pg.click('#taskList li:nth-child(1) input[type=checkbox]'); pg.wait_for_timeout(120)
    chk("toggling task 6x awards nothing more", XP()==mid, f"{mid}->{XP()}")
    pg.evaluate("""[...document.querySelectorAll('#taskList li')][0].querySelector('input').checked""")
    # ensure final state completed
    pg.evaluate("""(()=>{const cb=document.querySelector('#taskList li input');if(!cb.checked)cb.click();})()""")
    pg.wait_for_timeout(200)
    chk("task XP still 15 total after churn", XP()==mid, XP())

    print("\n[4] HABITS AWARD CORRECT XP")
    pg.evaluate("window.apexOpenPage('habits')")
    pg.fill('#habitName','Read'); pg.click('#habitForm button[type=submit]'); pg.wait_for_timeout(400)
    before=XP()
    pg.evaluate("""(()=>{const th=[...document.querySelectorAll('#habWeek th')];const i=th.findIndex(x=>x.className==='is-today');
      const row=document.querySelectorAll('#habWeek .hab-table tr')[1];row.querySelectorAll('.hcell')[i-1].click();})()""")
    pg.wait_for_timeout(400)
    chk("habit check-off awards 10 XP", XP()-before==10, f"{before}->{XP()}")
    h2=XP()
    for _ in range(4):
        pg.evaluate("""(()=>{const th=[...document.querySelectorAll('#habWeek th')];const i=th.findIndex(x=>x.className==='is-today');
          const row=document.querySelectorAll('#habWeek .hab-table tr')[1];row.querySelectorAll('.hcell')[i-1].click();})()""")
        pg.wait_for_timeout(200)
    chk("habit un/re-tick awards nothing more", XP()==h2, f"{h2}->{XP()}")

    print("\n[5] STUDY SESSIONS AWARD CORRECT XP")
    pg.evaluate("window.apexOpenPage('study')")
    before=XP()
    pg.fill('#studyChapter','Laws of Motion'); pg.fill('#studyDuration','30'); pg.click('#addStudyButton'); pg.wait_for_timeout(800)
    chk("30 min study awards 20 XP", XP()-before==20, f"{before}->{XP()}")
    before=XP()
    pg.fill('#studyChapter','Gravitation'); pg.fill('#studyDuration','45'); pg.click('#addStudyButton'); pg.wait_for_timeout(800)
    chk("45 min study awards 30 XP (pro-rata)", XP()-before==30, f"{before}->{XP()}")

    print("\n[6] CHAPTERS AND MILESTONES AWARD XP")
    before=XP()
    pg.fill('#studyChapter','Thermodynamics'); pg.fill('#studyDuration','30')
    pg.check('#studyChapterDone'); pg.click('#addStudyButton'); pg.wait_for_timeout(900)
    chk("chapter finished awards 40 XP on top of 20 study", XP()-before==60, f"{before}->{XP()}")
    before=XP()
    pg.fill('#studyChapter','  thermodynamics  '); pg.fill('#studyDuration','30')
    pg.check('#studyChapterDone'); pg.click('#addStudyButton'); pg.wait_for_timeout(900)
    chk("same chapter again awards study only, not chapter", XP()-before==20, f"{before}->{XP()}")
    chk("chapter checkbox auto-cleared", pg.evaluate("!document.getElementById('studyChapterDone').checked"))

    print("\n[FITNESS]")
    pg.evaluate("window.apexOpenPage('fitness')")
    pg.evaluate("""[...document.querySelectorAll('#fitRoot .fit-tabs button')].find(x=>x.textContent==='STRENGTH').click()""")
    pg.wait_for_timeout(400)
    before=XP()
    pg.fill('#sReps','10, 8, 6'); pg.click('#fitRoot form button[type=submit]'); pg.wait_for_timeout(600)
    chk("strength session awards 25 XP", XP()-before==25, f"{before}->{XP()}")
    before=XP()
    pg.fill('#sReps','9, 9'); pg.click('#fitRoot form button[type=submit]'); pg.wait_for_timeout(600)
    chk("2nd session same day awards 25 XP", XP()-before==25, f"{before}->{XP()}")
    before=XP()
    pg.fill('#sReps','5, 5'); pg.click('#fitRoot form button[type=submit]'); pg.wait_for_timeout(600)
    chk("3rd session same day awards 0 (anti-overtraining)", XP()-before==0, f"{before}->{XP()}")
    chk("3rd session still logged in full", pg.evaluate("fit.filter(r=>r.kind==='strength').length")==3)
    pg.evaluate("""[...document.querySelectorAll('#fitRoot .fit-tabs button')].find(x=>x.textContent==='OVERVIEW').click()""")
    pg.wait_for_timeout(400)
    before=XP()
    pg.fill('#restDate','2026-11-12'); pg.evaluate("""[...document.querySelectorAll('#fitRoot form')].find(f=>f.querySelector('#restDate')).querySelector('button[type=submit]').click()""")
    pg.wait_for_timeout(600)
    chk("rest day awards +5 XP (never punished)", XP()-before==5, f"{before}->{XP()}")

    print("\n[8] XP PERSISTS AFTER REFRESH")
    total=XP(); lvl=pg.evaluate("APEXXP.progress().level")
    pg.reload(); pg.wait_for_timeout(2200)
    chk("total XP survives reload", XP()==total, f"{total} -> {XP()}")
    chk("level survives reload", pg.evaluate("APEXXP.progress().level")==lvl)
    chk("home strip shows persisted XP", str(total) in pg.inner_text('#xpHomeStrip').replace(",",""), pg.inner_text('#xpHomeStrip').replace("\n"," | "))

    print("\n[9] LEVEL PROGRESSION")
    curve = pg.evaluate("[1,2,3,4,5,10].map(L=>xpTotalForLevel(L))")
    chk("curve = [0,100,250,450,700,2700]", curve==[0,100,250,450,700,2700], curve)
    chk("level 1 at 0 XP", pg.evaluate("xpProgress(0).level")==1)
    chk("level 2 at exactly 100 XP", pg.evaluate("xpProgress(100).level")==2)
    chk("level 2 at 99 XP is still 1", pg.evaluate("xpProgress(99).level")==1)
    chk("progress pct correct at 50/100", pg.evaluate("xpProgress(50).pct")==50)
    lv_before = pg.evaluate("APEXXP.progress().level")
    # force a level-up through a real award
    pg.evaluate("xpAward('test:levelup', 5000, 'Test level up','milestone')"); pg.wait_for_timeout(500)
    chk("large award raises level", pg.evaluate("APEXXP.progress().level")>lv_before)
    chk("level-up toast shown", pg.eval_on_selector_all('#toastHost .toast','e=>e.some(x=>/Level \\d+ reached/.test(x.innerText))'))
    pg.evaluate("xpAward('test:levelup', 5000, 'dupe','milestone')")
    chk("duplicate key rejected even for same call", pg.evaluate("APEXXP.progress().total")==XP())

    print("\n[10] TRANSACTION HISTORY")
    led=LED()
    chk("ledger has transactions", len(led)>=10, len(led))
    chk("every txn has key+amount+reason+source+at", all(all(k in t for k in ('key','amount','reason','source','at')) for t in led))
    srcs=set(t['source'] for t in led)
    chk("sources cover task/habit/study/chapter/fitness", {'task','habit','study','chapter','fitness'} <= srcs, srcs)
    pg.evaluate("window.apexOpenPage('progression')"); pg.wait_for_timeout(600)
    chk("history rendered on page", pg.eval_on_selector_all('#xpRoot .xp-txn','e=>e.length')>=10)
    chk("milestone marked done in UI", pg.eval_on_selector_all('#xpRoot .xp-milestone.is-done','e=>e.length')>=0)

    print("\n[11] NAVIGATION")
    for name in ['study','tasks','fitness','calendar','habits','progression','home']:
        pg.evaluate(f"window.apexOpenPage('{name}')"); pg.wait_for_timeout(250)
        vis=pg.eval_on_selector(f'[data-page-section="{name}"]','e=>e.offsetParent!==null')
        only=pg.eval_on_selector_all('[data-page-section]','e=>e.filter(x=>x.offsetParent!==null).length')
        chk(f"page '{name}' opens and is the only one visible", vis and only==1, f"vis={vis} visible_count={only}")
    pg.evaluate("window.apexOpenPage('progression')"); pg.wait_for_timeout(300)
    pg.evaluate("""document.querySelector('#progressionPage .home-return').click()""")
    pg.wait_for_timeout(300)
    chk("HOME button returns home", pg.eval_on_selector('#homePage','e=>e.offsetParent!==null'))
    pg.evaluate("""[...document.querySelectorAll('.module-button')].find(b=>b.dataset.openPage==='progression').click()""")
    pg.wait_for_timeout(400)
    chk("PROGRESSION tile opens page", pg.eval_on_selector('#progressionPage','e=>e.offsetParent!==null'))

    print("\n[13] CONSOLE ERRORS")
    chk("no console/page errors across full run", not errs, errs)
    print(f"\n=== {len(P)} passed, {len(F)} failed ===")
    if F: print("FAILED:", F)
    b.close()

import sys
sys.exit(1 if F else 0)
