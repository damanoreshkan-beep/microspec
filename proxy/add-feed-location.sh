#!/bin/bash
# Safely add `location /feed` (→ local feed-proxy :8787) to the jobs-map 443 vhost. nginx -t guarded.
set -e
F=/etc/nginx/sites-available/all-sites
if grep -q "location /feed" "$F"; then echo "already present — nothing to do"; exit 0; fi
BAK="$F.bak.$(date +%s)"
cp "$F" "$BAK"
awk '
/proxy_pass http:\/\/localhost:3334;/ { p=1 }
{ print }
p && /^[[:space:]]*}[[:space:]]*$/ {
  print "    location /feed {"
  print "        proxy_pass http://127.0.0.1:8787;"
  print "        proxy_set_header Host $host;"
  print "    }"
  p=0
}
' "$BAK" > "$F"
if nginx -t; then
  systemctl reload nginx
  echo "OK: /feed added → 127.0.0.1:8787, nginx reloaded (backup: $BAK)"
else
  cp "$BAK" "$F"
  echo "FAILED nginx -t → reverted from $BAK"
  exit 1
fi
