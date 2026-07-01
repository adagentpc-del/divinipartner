#!/usr/bin/env bash
#
# Download a free, self-hosted GeoIP database (no API key, no per-query cost).
# Reusable across all builds. Run on a machine with internet (your Mac or the
# server), then the app reads it locally via server/src/lib/geoip.ts.
#
# Default source: DB-IP IP-to-Country Lite (MMDB, refreshed monthly, free).
# Attribution required by DB-IP: "IP Geolocation by DB-IP" (https://db-ip.com).
# To use the richer city database instead, set TIER=city (still free).
#
# Usage:
#   bash scripts/fetch-geoip.sh            # country database
#   TIER=city bash scripts/fetch-geoip.sh  # city database (region + city)
#
set -euo pipefail

TIER="${TIER:-country}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/server/data/geo"
mkdir -p "$DIR"

MONTH="$(date +%Y-%m)"
PREV="$(date -d '1 month ago' +%Y-%m 2>/dev/null || date -v-1m +%Y-%m 2>/dev/null || echo "$MONTH")"

if [ "$TIER" = "city" ]; then
  NAME="dbip-city-lite"
else
  NAME="dbip-country-lite"
fi

fetch() {
  local m="$1"
  local url="https://download.db-ip.com/free/${NAME}-${m}.mmdb.gz"
  echo "Trying $url"
  curl -fSL "$url" -o "$DIR/${NAME}.mmdb.gz"
}

# DB-IP publishes the new month partway through; fall back to last month.
if ! fetch "$MONTH"; then
  echo "Current month not published yet, falling back to $PREV"
  fetch "$PREV"
fi

gunzip -f "$DIR/${NAME}.mmdb.gz"
echo "Installed: $DIR/${NAME}.mmdb"
echo "The app auto-detects this path. Optionally set GEOIP_DB_PATH=$DIR/${NAME}.mmdb"
echo "Remember the DB-IP attribution: \"IP Geolocation by DB-IP\"."
