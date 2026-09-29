#!/bin/sh
# Downloads the pinned server jars and verifies their hashes. Idempotent.
set -e
cd "$(dirname "$0")"

# fetch <file> <url> <hash-tool> <hash>
fetch() {
  if [ -f "$1" ] && echo "$4  $1" | $3 -c - >/dev/null 2>&1; then
    echo "$1 ok"; return
  fi
  curl -fL -o "$1" "$2"
  echo "$4  $1" | $3 -c -
}

PAPER_SHA=5ffef465eeeb5f2a3c23a24419d97c51afd7dbb4923ff42df9a3f58bba1ccfba
fetch paper-1.21.11-132.jar "https://fill-data.papermc.io/v1/objects/$PAPER_SHA/paper-1.21.11-132.jar" sha256sum "$PAPER_SHA"

mkdir -p plugins
fetch plugins/Chunky-Bukkit-1.4.40.jar \
  https://cdn.modrinth.com/data/fALzjamp/versions/P3y2MXnd/Chunky-Bukkit-1.4.40.jar sha512sum \
  b017fd180141b5c14c38dfb10128d5f5a1072a68ff93ee486d4465953331f5851f09a09b4a159364837a95d192198d8e9885ce39c46eed32dacbf1fd65c6f30f
