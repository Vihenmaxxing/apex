from playwright.sync_api import sync_playwright
import pathlib
APP = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'index.html'
url = APP.as_uri()
P=[];F=[]
def chk(n,c,d=""):
    (P if c else F).append(n); print(("  PASS  " if c else "  FAIL  ")+n+((" :: "+str(d)) if d else ""))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
    pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
    pg.goto(url); pg.wait_for_timeout(2200)

    print("\n[STADIUM — STRUCTURE]")
    chk("stadium tile on home", pg.eval_on_selector_all('.module-button','e=>e.map(x=>x.dataset.openPage)').count('stadium')==1)
    chk("mini stadium artwork drawn on tile", pg.eval_on_selector_all('#stadiumHomeCard svg.st-mini','e=>e.length')==1)
    pg.evaluate("window.apexOpenPage('stadium')"); pg.wait_for_timeout(900)
    chk("stadium page opens", pg.eval_on_selector('#stadiumPage','e=>e.offsetParent!==null'))
    chk("SVG built", pg.eval_on_selector_all('#stadiumSvg','e=>e.length')==1)
    nodes=pg.eval_on_selector_all('#stadiumSvg *','e=>e.length')
    chk("illustration has real detail (>150 svg nodes)", nodes>150, nodes)
    secs=sorted(pg.eval_on_selector_all('#stadiumSvg .st-stand','e=>e.map(x=>x.dataset.section)'))
    chk("all 5 sections present", secs==['clock-end','east-stand','north-bank','pitch','west-stand'], secs)
    chk("no external resource refs in SVG", pg.evaluate("""!/https?:\\/\\//.test(document.getElementById('stadiumSvg').outerHTML)"""))

    print("\n[STADIUM — INTERACTION]")
    for sec,name in [('north-bank','NORTH BANK'),('clock-end','CLOCK END'),('east-stand','EAST STAND'),('west-stand','WEST STAND'),('pitch','THE PITCH')]:
        pg.click(f'#stadiumSvg .st-stand[data-section="{sec}"] .st-stand-hit', force=True); pg.wait_for_timeout(250)
        panel=pg.inner_text('#stadiumPanel')
        sel=pg.eval_on_selector_all('#stadiumSvg .st-stand.is-selected','e=>e.map(x=>x.dataset.section)')
        chk(f"click {sec}: name + description + highlight", name in panel and len(panel)>150 and sel==[sec], f"sel={sel} len={len(panel)}")
    chk("dimming applied to unselected", pg.eval_on_selector('#stadiumSvg','e=>e.classList.contains("has-selection")'))
    pg.click('#stadiumPanel .st-clear'); pg.wait_for_timeout(300)
    chk("reset clears selection", pg.eval_on_selector_all('#stadiumSvg .st-stand.is-selected','e=>e.length')==0)
    chk("panel falls back to facts", 'CAPACITY' in pg.inner_text('#stadiumPanel'))
    pg.click('#stadiumSvg .st-stand[data-section="pitch"] .st-stand-hit', force=True); pg.wait_for_timeout(200)
    pg.click('#stadiumSvg .st-stand[data-section="pitch"] .st-stand-hit', force=True); pg.wait_for_timeout(250)
    chk("clicking selected section toggles it off", pg.eval_on_selector_all('#stadiumSvg .st-stand.is-selected','e=>e.length')==0)
    # keyboard
    pg.evaluate("""document.querySelector('#stadiumSvg .st-stand[data-section="east-stand"]').focus()""")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    chk("keyboard Enter selects", 'EAST STAND' in pg.inner_text('#stadiumPanel'))

    print("\n[STADIUM — VIEWS]")
    pg.evaluate("""[...document.querySelectorAll('.st-views button')].find(b=>b.textContent.includes('SEATING PLAN')).click()""")
    pg.wait_for_timeout(600)
    chk("plan view builds", pg.eval_on_selector('#stadiumSvg','e=>e.classList.contains("st-view-plan")'))
    secs2=sorted(pg.eval_on_selector_all('#stadiumSvg .st-stand','e=>e.map(x=>x.dataset.section)'))
    chk("plan view has same 5 sections", secs2==['clock-end','east-stand','north-bank','pitch','west-stand'], secs2)
    pg.click('#stadiumSvg .st-stand[data-section="west-stand"] .st-stand-hit', force=True); pg.wait_for_timeout(250)
    chk("plan view sections clickable", 'WEST STAND' in pg.inner_text('#stadiumPanel'))
    pg.reload(); pg.wait_for_timeout(2200); pg.evaluate("window.apexOpenPage('stadium')"); pg.wait_for_timeout(700)
    chk("view preference persists across reload", pg.eval_on_selector('#stadiumSvg','e=>e.classList.contains("st-view-plan")'))
    pg.evaluate("""[...document.querySelectorAll('.st-views button')].find(b=>b.textContent.includes('THREE-QUARTER')).click()""")
    pg.wait_for_timeout(500)
    chk("switch back to bowl", pg.eval_on_selector('#stadiumSvg','e=>e.classList.contains("st-view-bowl")'))

    print("\n[REGRESSION — 4.7 FEATURES STILL WORK]")
    for name in ['study','tasks','fitness','calendar','habits','progression','stadium','home']:
        pg.evaluate(f"window.apexOpenPage('{name}')"); pg.wait_for_timeout(230)
        only=pg.eval_on_selector_all('[data-page-section]','e=>e.filter(x=>x.offsetParent!==null).length')
        chk(f"nav: {name}", pg.eval_on_selector(f'[data-page-section="{name}"]','e=>e.offsetParent!==null') and only==1, only)
    chk("XP strip still on home", pg.eval_on_selector('#xpHomeStrip','e=>e.children.length>0'))
    chk("home order preserved + stadium tile added",
        pg.eval_on_selector_all('#homePage > *','e=>e.map(x=>x.className))'.replace('))',')'))==['home-top','card xp-strip','quote-card card','module-grid','card garage-card'])
    pg.evaluate("window.apexOpenPage('tasks')")
    pg.fill('#taskInput','Reg test'); pg.click('#addTaskButton'); pg.wait_for_timeout(200)
    before=pg.evaluate("xpState.totalXP")
    pg.click('#taskList li:nth-child(1) input[type=checkbox]'); pg.wait_for_timeout(300)
    chk("XP still awards 15 for a task", pg.evaluate("xpState.totalXP")-before==15)
    print("\n[BACKUP]")
    pg.evaluate("window.apexOpenPage('progression')"); pg.wait_for_timeout(600)
    chk("APEX DATA card appended to progression", 'APEX DATA' in pg.inner_text('#xpRoot'))
    chk("platform detected as browser", pg.evaluate("APEX_PLATFORM.name")=="browser")
    bk=pg.evaluate("apexBuildBackup()")
    chk("backup contains apex keys", 'apexXPState' in bk['localStorage'] and 'apexTasks' in bk['localStorage'], list(bk['localStorage'].keys()))
    chk("backup format tagged", bk['format']=='apex-backup' and bk['version']==1)
    res=pg.evaluate("""(async()=>{const f=new File([JSON.stringify(apexBuildBackup())],'b.json',{type:'application/json'});return await apexImportBackup(f);})()""")
    chk("import accepts its own backup", res['ok'], res)
    bad=pg.evaluate("""(async()=>{const f=new File(['{"a":1}'],'b.json');return await apexImportBackup(f);})()""")
    chk("import rejects a non-APEX file", not bad['ok'], bad)

    chk("no console/page errors", not errs, errs)
    print(f"\n=== {len(P)} passed, {len(F)} failed ===")
    if F: print("FAILED:",F)
    b.close()

import sys
sys.exit(1 if F else 0)
