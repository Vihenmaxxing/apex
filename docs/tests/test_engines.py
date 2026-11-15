"""Engine-agnostic smoke suite.

Runs the core of APEX against whichever engine is named on the command line:

    python docs/tests/test_engines.py webkit
    python docs/tests/test_engines.py firefox
    python docs/tests/test_engines.py chromium     (default)

WebKit matters most here. It is the engine behind Safari and behind iOS
WKWebView, which is what the Tauri iOS build renders in. Running this on
WebKit is the closest automated check on iOS rendering that exists without a
physical device, and it catches the things that actually differ between
engines: CSS support, SVG behaviour, storage APIs and date handling.

It deliberately does not duplicate the functional suites. It checks that APEX
loads, that every module renders, that storage works, that XP is awarded and
that the stadium is interactive.
"""
from playwright.sync_api import sync_playwright
import pathlib, sys

ENGINE = sys.argv[1] if len(sys.argv) > 1 else "chromium"
APP = pathlib.Path(__file__).resolve().parents[2] / "src" / "index.html"
url = APP.as_uri()

P, F = [], []
def chk(name, condition, detail=""):
    (P if condition else F).append(name)
    print(("  PASS  " if condition else "  FAIL  ") + name + ((" :: " + str(detail)) if detail else ""))

print(f"\n=== APEX smoke suite on {ENGINE.upper()} ===")

with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()
    print("  engine version:", browser.version)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text)
            if m.type == "error" and "ERR_NAME" not in m.text and "net::" not in m.text else None)

    page.goto(url)
    page.wait_for_timeout(2500)

    print("\n[LOAD]")
    chk("application boots", page.evaluate("typeof xpState !== 'undefined'"))
    chk("no errors on load", not errors, errors[:3])
    chk("platform layer initialised", page.evaluate("typeof APEX_PLATFORM === 'object'"))

    print("\n[MODULES]")
    for name in ["study", "tasks", "fitness", "calendar", "habits", "progression", "stadium", "home"]:
        page.evaluate(f"window.apexOpenPage('{name}')")
        page.wait_for_timeout(350)
        visible = page.eval_on_selector(f'[data-page-section="{name}"]', "e=>e.offsetParent!==null")
        only = page.eval_on_selector_all("[data-page-section]", "e=>e.filter(x=>x.offsetParent!==null).length")
        chk(f"page '{name}' renders alone", visible and only == 1, f"visible={visible} count={only}")

    print("\n[STORAGE]")
    chk("localStorage works", page.evaluate(
        "(()=>{try{localStorage.setItem('apexEngineProbe','1');"
        "const v=localStorage.getItem('apexEngineProbe');"
        "localStorage.removeItem('apexEngineProbe');return v==='1'}catch{return false}})()"))
    chk("IndexedDB available", page.evaluate("!!window.indexedDB"))
    chk("study records loaded through IndexedDB or the fallback",
        page.evaluate("typeof studyRecords !== 'undefined' && Array.isArray(studyRecords)"))

    print("\n[XP]")
    page.evaluate("window.apexOpenPage('tasks')")
    page.wait_for_timeout(300)
    page.fill("#taskInput", "Engine check")
    page.click("#addTaskButton")
    page.wait_for_timeout(250)
    before = page.evaluate("xpState.totalXP")
    page.click("#taskList li:first-child input[type=checkbox]")
    page.wait_for_timeout(500)
    chk("task completion awards 15 XP", page.evaluate("xpState.totalXP") - before == 15,
        f"{before} -> {page.evaluate('xpState.totalXP')}")
    total = page.evaluate("xpState.totalXP")
    page.reload()
    page.wait_for_timeout(2500)
    chk("XP persists across reload", page.evaluate("xpState.totalXP") == total)
    chk("home XP strip renders", page.eval_on_selector("#xpHomeStrip", "e=>e.children.length>0"))

    print("\n[STADIUM — SVG RENDERING]")
    page.evaluate("window.apexOpenPage('stadium')")
    page.wait_for_timeout(900)
    chk("SVG illustration builds", page.eval_on_selector_all("#stadiumSvg", "e=>e.length") == 1)
    nodes = page.eval_on_selector_all("#stadiumSvg *", "e=>e.length")
    chk("illustration has full detail", nodes > 150, nodes)
    chk("all five sections present", sorted(page.eval_on_selector_all(
        "#stadiumSvg .st-stand", "e=>e.map(x=>x.dataset.section)")) ==
        ["clock-end", "east-stand", "north-bank", "pitch", "west-stand"])
    # Geometry: polygons must have resolved to real numbers, not NaN.
    bad = page.evaluate("""[...document.querySelectorAll('#stadiumSvg polygon')]
        .filter(p => /NaN|undefined/.test(p.getAttribute('points')||'')).length""")
    chk("no NaN in any polygon geometry", bad == 0, bad)
    box = page.eval_on_selector("#stadiumSvg", "e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}}")
    chk("illustration has real rendered size", box["w"] > 300 and box["h"] > 150, box)
    page.click('#stadiumSvg .st-stand[data-section="north-bank"] .st-stand-hit', force=True)
    page.wait_for_timeout(400)
    chk("section selection works", "NORTH BANK" in page.inner_text("#stadiumPanel"))
    chk("selection highlight applied",
        page.eval_on_selector_all("#stadiumSvg .st-stand.is-selected", "e=>e.length") == 1)
    page.evaluate("""[...document.querySelectorAll('.st-views button')].find(b=>b.textContent.includes('SEATING')).click()""")
    page.wait_for_timeout(700)
    chk("plan view builds", page.eval_on_selector("#stadiumSvg", "e=>e.classList.contains('st-view-plan')"))

    print("\n[LAYOUT]")
    chk("no horizontal overflow at 1280px",
        not page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(600)
    chk("no horizontal overflow at 390px",
        not page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2"))

    print("\n[CSS FEATURES APEX DEPENDS ON]")
    for label, expression in [
        ("CSS grid", "CSS.supports('display','grid')"),
        ("conic-gradient (donut charts)", "CSS.supports('background','conic-gradient(red 0deg, blue 180deg)')"),
        ("env() safe-area insets", "CSS.supports('padding-top','env(safe-area-inset-top)')"),
        ("clamp()", "CSS.supports('font-size','clamp(1rem,2vw,2rem)')"),
        ("backdrop-filter", "CSS.supports('backdrop-filter','blur(8px)')"),
        ("CSS custom properties", "CSS.supports('color','var(--x)')"),
    ]:
        chk(label, page.evaluate(expression))

    chk("no errors across the whole run", not errors, errors[:3])
    browser.close()

print(f"\n=== {ENGINE}: {len(P)} passed, {len(F)} failed ===")
if F:
    print("FAILED:", F)
sys.exit(1 if F else 0)
