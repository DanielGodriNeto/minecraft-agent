#!/bin/sh
cd "$(dirname "$0")"
exec java -Xms2G -Xmx4G -jar paper-1.21.11-132.jar --nogui
