#!/bin/sh
# Fetch the Xray binary into the build context.
#
# Done here rather than in the Dockerfile because the build container has no
# outbound network on this machine — apt-get and curl both fail inside it — so
# the download has to happen on the host, where GitHub is reachable.
set -eu

VERSION="${XRAY_VERSION:-latest}"
DEST="$(cd "$(dirname "$0")" && pwd)/bin"
URL="https://github.com/XTLS/Xray-core/releases/${VERSION}/download/Xray-linux-64.zip"

mkdir -p "$DEST"
echo "Downloading $URL"
curl -fsSL -o "$DEST/xray.zip" "$URL"
unzip -o -q "$DEST/xray.zip" -d "$DEST" xray
rm -f "$DEST/xray.zip"
chmod +x "$DEST/xray"
echo "Wrote $DEST/xray"
