#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Discogs to Spotify Sync..."

pkill -f localtunnel 2>/dev/null
pkill -f "node.*server.js" 2>/dev/null
sleep 1

npx localtunnel --port 3456 > /tmp/d2s-lt.txt 2>&1 &
sleep 5

LT_URL=$(grep -o 'https://[^.]*\.loca\.lt' /tmp/d2s-lt.txt 2>/dev/null)
if [ -z "$LT_URL" ]; then
  echo "ERROR: Could not get localtunnel URL"
  cat /tmp/d2s-lt.txt
  exit 1
fi

echo "Public URL: $LT_URL"

REDIRECT_URL="${LT_URL}/api/callback" \
nohup node "$DIR/server.js" > "$DIR/server.log" 2>&1 &

sleep 2

echo ""
echo "============================================"
echo "  App URL: $LT_URL"
echo ""
echo "  Before using, add this to your"
echo "  Spotify Developer Dashboard:"
echo ""
echo "  ${LT_URL}/api/callback"
echo ""
echo "  Local URL: http://127.0.0.1:3456"
echo "============================================"
