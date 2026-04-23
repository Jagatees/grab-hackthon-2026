#!/usr/bin/env python3
"""
Correctness bug hunter for GrabMaps APIs.
Usage:
  export API_BASE=https://maps.grab.com
  export API_KEY=your_key_here
  python3 stress/correctness_check.py
"""

import os, sys, json, time, requests
from datetime import datetime

BASE    = os.environ.get("API_BASE", "https://maps.grab.com")
KEY     = os.environ.get("API_KEY", "")
HEADERS = {"Authorization": f"Bearer {KEY}"} if KEY else {}

os.makedirs("results", exist_ok=True)
OUT  = f"results/correctness_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
bugs = []

def log(msg):
    print(msg)
    with open(OUT, "a") as f:
        f.write(msg + "\n")

def get(path, params=None):
    try:
        return requests.get(f"{BASE}{path}", params=params, headers=HEADERS, timeout=10)
    except requests.exceptions.Timeout:
        log(f"  [TIMEOUT] {path}")
        return None
    except Exception as e:
        log(f"  [CONN ERROR] {path}: {e}")
        return None

def bug(title, detail=""):
    bugs.append((title, detail))
    log(f"[BUG] {title}")
    if detail:
        log(f"      {detail}")

def check(title, condition, detail=""):
    if not condition:
        bug(title, detail)
    else:
        log(f"[OK]  {title}")

SG1 = "1.3521,103.8198"
SG2 = "1.2800,103.8501"
SG3 = "1.3000,103.8000"

log("=" * 60)
log(f"GrabMaps Correctness Checks — {datetime.now()}")
log(f"BASE: {BASE}")
log("=" * 60)

# ── 1. Route distance symmetry ────────────────────────────────────────────────
log("\n[1] Route distance: A→B should ≈ B→A")
r1 = get("/route", {"from": SG1, "to": SG2})
r2 = get("/route", {"from": SG2, "to": SG1})
if r1 and r2 and r1.status_code == 200 and r2.status_code == 200:
    try:
        def extract_dist(r):
            j = r.json()
            return j.get("distance") or (j.get("routes") or [{}])[0].get("distance")
        d1, d2 = extract_dist(r1), extract_dist(r2)
        if d1 and d2:
            pct = abs(d1 - d2) / max(d1, d2) * 100
            log(f"  A→B: {d1}m, B→A: {d2}m, diff: {pct:.1f}%")
            check("Route distance symmetry (within 5%)", pct < 5,
                  f"A→B={d1}, B→A={d2}, diff={pct:.1f}%")
    except Exception as e:
        log(f"  Parse error: {e}")

# ── 2. Circular route ─────────────────────────────────────────────────────────
log("\n[2] Circular route (from==to) should be distance=0 or 4xx")
r = get("/route", {"from": SG1, "to": SG1})
if r:
    if r.status_code >= 500:
        bug("Circular route causes 5xx", f"HTTP {r.status_code}")
    elif r.status_code == 200:
        try:
            dist = r.json().get("distance") or (r.json().get("routes") or [{}])[0].get("distance")
            check("Circular route distance is 0", not dist or dist == 0,
                  f"Non-zero distance for same-point route: {dist}")
        except:
            pass

# ── 3. Invalid coords should be 4xx ──────────────────────────────────────────
log("\n[3] Invalid coordinates should return 4xx, not 200")
for lat, lng, label in [
    ("91",   "0",   "lat > 90"),
    ("0",    "181", "lng > 180"),
    ("-91",  "0",   "lat < -90"),
    ("NaN",  "0",   "NaN lat"),
    ("0",    "NaN", "NaN lng"),
    ("1e10", "0",   "sci notation"),
]:
    r = get("/geocode/reverse", {"lat": lat, "lng": lng})
    if r:
        check(f"Invalid coord ({label}) returns 4xx",
              400 <= r.status_code < 500,
              f"HTTP {r.status_code} for {label}")

# ── 4. Geocode determinism ────────────────────────────────────────────────────
log("\n[4] Same geocode query returns consistent results")
QUERY = "Marina Bay Sands, Singapore"
lats = []
for _ in range(3):
    r = get("/geocode", {"q": QUERY})
    if r and r.status_code == 200:
        try:
            j = r.json()
            lat = j.get("lat") or (j.get("results") or [{}])[0].get("geometry", {}).get("location", {}).get("lat")
            if lat:
                lats.append(round(float(lat), 4))
        except:
            pass
    time.sleep(0.2)
if len(lats) >= 2:
    check("Geocode is deterministic", len(set(lats)) == 1,
          f"Same query returned different lats: {lats}")

# ── 5. Missing required params return 4xx ─────────────────────────────────────
log("\n[5] Missing required params should return 4xx")
for path, params, label in [
    ("/geocode", {}, "q"),
    ("/geocode/reverse", {}, "lat+lng"),
    ("/route", {}, "from+to"),
]:
    r = get(path, params)
    if r:
        check(f"{path} missing {label} → 4xx",
              400 <= r.status_code < 500,
              f"HTTP {r.status_code}")

# ── 6. Error body is valid JSON with error field ───────────────────────────────
log("\n[6] Error responses should be valid JSON with an error field")
r = get("/geocode", {"q": ""})
if r and r.status_code >= 400:
    try:
        body = r.json()
        has_err = any(k in body for k in ["error", "message", "code", "detail", "errors"])
        check("Error response has error field", has_err,
              f"Keys found: {list(body.keys())}")
    except:
        bug("Error response is not valid JSON", f"HTTP {r.status_code}, body: {r.text[:200]}")

# ── 7. No auth should return 401/403 ─────────────────────────────────────────
log("\n[7] Requests without API key should return 401 or 403")
r = requests.get(f"{BASE}/geocode", params={"q": "Singapore"}, timeout=10)
check("No-auth request returns 401/403",
      r.status_code in (401, 403),
      f"HTTP {r.status_code} — endpoint may be publicly accessible without a key!")

# ── Summary ───────────────────────────────────────────────────────────────────
log("\n" + "=" * 60)
log(f"Done — {len(bugs)} bugs found. Results: {OUT}")
if bugs:
    log("\nBUGS:")
    for title, detail in bugs:
        log(f"  • {title}")
        if detail:
            log(f"    {detail}")
log("=" * 60)

sys.exit(1 if bugs else 0)
