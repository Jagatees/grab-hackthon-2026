#!/usr/bin/env bash
# Master runner — runs all stress tests in sequence
# Usage: bash run_all.sh

source config.sh

if [[ -z "$API_KEY" ]]; then
  echo "ERROR: Set API_KEY in config.sh before running"
  exit 1
fi

echo "=================================================="
echo "GrabMaps Stress Test Suite"
echo "BASE: $API_BASE"
echo "=================================================="

mkdir -p results

echo ""
echo "[1/3] Edge case bug hunt..."
bash stress/edge_cases.sh

echo ""
echo "[2/3] Rate limit detection..."
bash stress/rate_limit.sh

echo ""
echo "[3/3] Correctness checks..."
python3 stress/correctness_check.py

echo ""
echo "=================================================="
echo "All done! Check the results/ folder for reports."
echo ""
echo "To run the k6 load test:"
echo "  k6 run -e API_KEY=\$API_KEY -e BASE=\$API_BASE stress/k6_load.js"
echo "=================================================="
