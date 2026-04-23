#!/usr/bin/env bash
# Edge case bug hunter — run every endpoint with nasty inputs
# Usage: source config.sh && bash stress/edge_cases.sh
# Output is saved to results/edge_cases_<timestamp>.txt

source "$(dirname "$0")/../config.sh"

OUTDIR="$(dirname "$0")/../results"
mkdir -p "$OUTDIR"
OUT="$OUTDIR/edge_cases_$(date +%Y%m%d_%H%M%S).txt"
PASS=0; FAIL=0; BUGS=()

log()  { echo "$1" | tee -a "$OUT"; }
bug()  { BUGS+=("$1"); FAIL=$((FAIL+1)); log "[BUG] $1"; }
pass() { PASS=$((PASS+1)); }

probe() {
  local tag="$1"; local url="$2"
  local body code
  code=$(curl -s -o /tmp/grab_body.txt -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    --max-time 10 "$url" 2>/dev/null)
  body=$(cat /tmp/grab_body.txt)

  if [[ "$code" == "5"* ]]; then
    bug "HTTP $code on: $tag | url: $url | body: ${body:0:200}"
    return
  fi

  if echo "$body" | grep -qE "(Exception|Traceback|at .+\.[a-z]+:[0-9]+|panic:|stack trace)"; then
    bug "STACK TRACE LEAKED on: $tag | url: $url | body: ${body:0:300}"
    return
  fi

  if echo "$body" | grep -q "<script>"; then
    bug "XSS REFLECTION on: $tag | url: $url"
    return
  fi

  if [[ "$code" == "200" && ("$tag" == *"NaN"* || "$tag" == *"91,"* || "$tag" == *"Infinity"*) ]]; then
    log "[SUSPICIOUS] Got 200 on invalid input: $tag | body: ${body:0:100}"
  fi

  pass
  log "[OK $code] $tag"
}

log "=================================================="
log "GrabMaps Edge Case Bug Hunt — $(date)"
log "BASE: $API_BASE"
log "=================================================="

# ── 1. Geocoding ──────────────────────────────────────────────────────────────
log "\n=== GEOCODING ==="
probe "geocode: empty q"          "$API_BASE/geocode?q="
probe "geocode: whitespace"       "$API_BASE/geocode?q=%20"
probe "geocode: null byte"        "$API_BASE/geocode?q=%00"
probe "geocode: XSS"              "$API_BASE/geocode?q=%3Cscript%3Ealert(1)%3C/script%3E"
probe "geocode: SQLi"             "$API_BASE/geocode?q=%27+OR+1%3D1--"
probe "geocode: huge string"      "$API_BASE/geocode?q=$(python3 -c 'print("A"*10000)')"
probe "geocode: CJK"              "$API_BASE/geocode?q=%E6%96%B0%E5%8A%A0%E5%9D%A1"
probe "geocode: null string"      "$API_BASE/geocode?q=null"
probe "geocode: array injection"  "$API_BASE/geocode?q[]=Singapore&q[]=Malaysia"
probe "geocode: path traversal"   "$API_BASE/geocode?q=../../etc/passwd"
probe "geocode: no params"        "$API_BASE/geocode"

# ── 2. Reverse Geocoding ──────────────────────────────────────────────────────
log "\n=== REVERSE GEOCODING ==="
probe "reverse: null island 0,0"    "$API_BASE/geocode/reverse?lat=0&lng=0"
probe "reverse: pole 90,180"        "$API_BASE/geocode/reverse?lat=90&lng=180"
probe "reverse: out-of-range 91,0"  "$API_BASE/geocode/reverse?lat=91&lng=0"
probe "reverse: out-of-range 0,181" "$API_BASE/geocode/reverse?lat=0&lng=181"
probe "reverse: NaN"                "$API_BASE/geocode/reverse?lat=NaN&lng=NaN"
probe "reverse: Infinity"           "$API_BASE/geocode/reverse?lat=Infinity&lng=0"
probe "reverse: negative zero"      "$API_BASE/geocode/reverse?lat=-0.0&lng=0.0"
probe "reverse: sci notation"       "$API_BASE/geocode/reverse?lat=1e10&lng=1e10"
probe "reverse: empty"              "$API_BASE/geocode/reverse?lat=&lng="
probe "reverse: string coords"      "$API_BASE/geocode/reverse?lat=abc&lng=def"
probe "reverse: no params"          "$API_BASE/geocode/reverse"

# ── 3. Routing ────────────────────────────────────────────────────────────────
log "\n=== ROUTING ==="
probe "route: normal SG"            "$API_BASE/route?from=1.3521,103.8198&to=1.2800,103.8501"
probe "route: circular same point"  "$API_BASE/route?from=1.3521,103.8198&to=1.3521,103.8198"
probe "route: ocean points"         "$API_BASE/route?from=1.0,103.5&to=0.0,104.0"
probe "route: NaN coords"           "$API_BASE/route?from=NaN,NaN&to=0,0"
probe "route: out-of-range lat"     "$API_BASE/route?from=91,0&to=0,0"
probe "route: antipodal"            "$API_BASE/route?from=1.3,103.8&to=-1.3,-76.2"
probe "route: missing 'to'"         "$API_BASE/route?from=1.3521,103.8198"
probe "route: missing 'from'"       "$API_BASE/route?to=1.3521,103.8198"
probe "route: no params"            "$API_BASE/route"
probe "route: string coords"        "$API_BASE/route?from=Singapore&to=KualaLumpur"

# ── 4. Places ─────────────────────────────────────────────────────────────────
log "\n=== PLACES SEARCH ==="
probe "places: normal"              "$API_BASE/places?q=food&lat=1.3521&lng=103.8198"
probe "places: planet bbox"         "$API_BASE/places?bbox=-90,-180,90,180"
probe "places: inverted bbox"       "$API_BASE/places?bbox=90,180,-90,-180"
probe "places: zero-area bbox"      "$API_BASE/places?bbox=1.3,103.8,1.3,103.8"
probe "places: empty q"             "$API_BASE/places?q=&lat=1.3521&lng=103.8198"
probe "places: no params"           "$API_BASE/places"
probe "places: XSS"                 "$API_BASE/places?q=%3Cscript%3Ealert(1)%3C/script%3E&lat=1.3521&lng=103.8198"
probe "places: huge radius"         "$API_BASE/places?q=food&lat=1.3521&lng=103.8198&radius=999999999"
probe "places: negative radius"     "$API_BASE/places?q=food&lat=1.3521&lng=103.8198&radius=-1"

# ── 5. Distance Matrix ────────────────────────────────────────────────────────
log "\n=== DISTANCE MATRIX ==="
probe "matrix: 5x5"       "$API_BASE/distancematrix?origins=1,2|3,4|5,6|7,8|9,10&destinations=1,2|3,4|5,6|7,8|9,10"
probe "matrix: same O=D"  "$API_BASE/distancematrix?origins=1.3521,103.8198&destinations=1.3521,103.8198"
probe "matrix: no params" "$API_BASE/distancematrix"

# ── 6. Rate Limit Detection ───────────────────────────────────────────────────
log "\n=== RATE LIMIT CHECK ==="
log "Firing 100 rapid requests to geocode — checking for 429..."
RATE_429=0
for i in $(seq 1 100); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "$API_BASE/geocode?q=Singapore&_=$i")
  [[ "$code" == "429" ]] && RATE_429=$((RATE_429+1))
done
if [[ $RATE_429 -eq 0 ]]; then
  bug "No 429 rate limiting detected after 100 rapid requests to /geocode"
else
  log "[OK] Got $RATE_429 rate limit (429) responses — rate limiting is active"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
log "\n=================================================="
log "SUMMARY: $PASS passed, $FAIL potential bugs found"
log "Results saved to: $OUT"
if [[ ${#BUGS[@]} -gt 0 ]]; then
  log "\nBUGS TO REPORT:"
  for b in "${BUGS[@]}"; do log "  • $b"; done
fi
log "=================================================="
