#!/bin/sh
# Downloads Paper 1.21.11 build 132 and verifies sha256. Idempotent.
set -e
cd "$(dirname "$0")"
JAR=paper-1.21.11-132.jar
SHA=5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba
URL=https://fill-data.papermc.io/v1/objects/$SHA/$JAR
if [ -f "$JAR" ] && echo "$SHA  $JAR" | sha256sum -c - >/dev/null 2>&1; then
  echo "$JAR ok"; exit 0
fi
curl -fL -o "$JAR" "$URL"
echo "$SHA  $JAR" | sha256sum -c -
