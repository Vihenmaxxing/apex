#!/usr/bin/env python3
"""Run every APEX browser test suite and summarise the result.

    python docs/tests/run_all.py

Requires: pip install playwright && python -m playwright install chromium
"""
import subprocess, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent
SUITES = ["test_xp.py", "test_data.py", "test_edge.py", "test_stadium.py", "test_platform.py"]

failed = []
for suite in SUITES:
    print(f"\n{'=' * 60}\n  {suite}\n{'=' * 60}")
    result = subprocess.run([sys.executable, str(HERE / suite)])
    if result.returncode != 0:
        failed.append(suite)

print(f"\n{'=' * 60}")
if failed:
    print("SUITES FAILED:", ", ".join(failed))
    sys.exit(1)
print(f"All {len(SUITES)} suites passed.")
