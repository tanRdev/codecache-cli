#!/usr/bin/env bash

set -euo pipefail

REPO="tanRdev/codecache-cli"
INSTALL_DIR="${CODECACHE_INSTALL_DIR:-$HOME/.local/bin}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd tar
require_cmd node

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 24 || (major === 24 && minor >= 13) ? 0 : 1)'; then
  printf 'codecache-cli requires Node >= 24.13.0\n' >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"

RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")"
TARBALL_URL="$(printf '%s' "$RELEASE_JSON" | node -e 'const fs = require("fs"); const release = JSON.parse(fs.readFileSync(0, "utf8")); const asset = release.assets.find((item) => item.name.endsWith(".tgz")); if (!asset) process.exit(1); process.stdout.write(asset.browser_download_url);')"

if [ -z "$TARBALL_URL" ]; then
  printf 'Could not find release tarball asset for %s\n' "$REPO" >&2
  exit 1
fi

ARCHIVE_PATH="$TMP_DIR/codecache-cli.tgz"
PACKAGE_DIR="$TMP_DIR/package"

curl -fsSL "$TARBALL_URL" -o "$ARCHIVE_PATH"
tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"

cat > "$INSTALL_DIR/cache" <<EOF
#!/usr/bin/env bash
node "$PACKAGE_DIR/bin/cache.js" "\$@"
EOF

chmod +x "$INSTALL_DIR/cache"

printf 'Installed cache to %s/cache\n' "$INSTALL_DIR"
printf 'Ensure %s is on your PATH\n' "$INSTALL_DIR"
