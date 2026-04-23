#!/usr/bin/env bash
# Rate limit detection — find threshold and test bypass techniques
# Usage: source config.sh && bash stress/rate_limit.sh [endpoint]

source "$(dirname "$0")/../config.sh"

ENDPOINT="${1:-/geocode?q=Singapore}"
FULL_URL="$API_BASE$ENDPOINT"

OUTDIR="$(dirname "$0")/../results"
mkdir -p "$OUTDIR"
OUT="$OUTDIR/ratelimit_$(date +%Y%m%d_%H%M%S).txt"

log() { echo "$1" | tee -a "$OUT"; }

log "Rate Limit Tests — $(date)"
log "Target: $FULL_URL"
log "=================================================="

# ── Test 1: Find the 429 threshold ────────────────────────────────────────────
log "\n[1] Finding rate limit threshold (sending up to 500 requests)..."
FIRST_429=-1
for i in $(seq 1 500); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "$FULL_URL")
  if [[ "$code" == "429" && $FIRST_429 -eq -1 ]]; then
    FIRST_429=$i
    log "  First 429 at request #$i"
  fi
  if [[ "$code" == "5"* ]]; then
    log "  [BUG] Got $code at request #$i"
  fi
done
if [[ $FIRST_429 -eq -1 ]]; then
  log "  [BUG] No 429 after 500 requests — MISSING RATE LIMITING"
else
  log "  Rate limit threshold: ~$FIRST_429 requests"
fi

# ── Test 2: Cache-busting bypass ──────────────────────────────────────────────
log "\n[2] Cache-bust bypass (unique params)..."
BYPASS_200=0
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "$FULL_URL&_cb=$RANDOM$i")
  [[ "$code" == "200" ]] && BYPASS_200=$((BYPASS_200+1))
done
log "  Got 200 on $BYPASS_200/50 cache-busted requests"
[[ $BYPASS_200 -gt 40 ]] && log "  [POTENTIAL BUG] Rate limit may be bypassable via cache-busting"

# ── Test 3: User-Agent rotation ───────────────────────────────────────────────
log "\n[3] User-Agent rotation bypass..."
for ua in "Mozilla/5.0" "curl/7.0" "python-requests/2.28" "Googlebot/2.1" ""; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "User-Agent: $ua" \
    "$FULL_URL")
  log "  UA='$ua': HTTP $code"
done

# ── Test 4: API key placement ─────────────────────────────────────────────────
log "\n[4] API key placement variations..."
if [[ -n "$API_KEY" ]]; then
  c1=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" "$FULL_URL")
  log "  Authorization header: $c1"
  c2=$(curl -s -o /dev/null -w "%{http_code}" "$FULL_URL&key=$API_KEY")
  log "  ?key= query param: $c2"
  c3=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" "$FULL_URL")
  log "  X-API-Key header: $c3"
  c4=$(curl -s -o /dev/null -w "%{http_code}" "$FULL_URL")
  log "  No auth: $c4"
  [[ "$c4" == "200" ]] && log "  [BUG] Endpoint accessible without authentication!"
fi

# ── Test 5: Concurrent burst ──────────────────────────────────────────────────
log "\n[5] Concurrent burst (100 parallel requests)..."
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${API_KEY}" \
    "$FULL_URL" > /tmp/grab_code_$i.txt &
done
wait
declare -A BUCKET
for i in $(seq 1 100); do
  code=$(cat /tmp/grab_code_$i.txt 2>/dev/null)
  BUCKET[$code]=$((${BUCKET[$code]:-0}+1))
done
for code in "${!BUCKET[@]}"; do
  log "  HTTP $code: ${BUCKET[$code]} responses"
done
rm -f /tmp/grab_code_*.txt

log "\n=================================================="
log "Rate limit test complete. Results: $OUT"
