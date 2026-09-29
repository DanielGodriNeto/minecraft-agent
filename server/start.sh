#!/bin/sh
# Usage: start.sh                 -> flat test world (server.properties)
#        start.sh diamonds        -> normal world for runs (diamonds.properties)
cd "$(dirname "$0")"
exec java -Xms2G -Xmx4G -jar paper-1.21.11-132.jar --nogui --config "${1:-server}.properties"
