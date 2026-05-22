#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Diligent Code Studio Linux/macOS Release Helper =="
echo "Workspace: $ROOT_DIR"

npm install
npm run build
npm run tauri:build

RELEASE_ROOT="$ROOT_DIR/releases"
mkdir -p "$RELEASE_ROOT"

VERSION="$(node -e "console.log(require('./package.json').version)")"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$RELEASE_ROOT/DiligentCodeStudio_v${VERSION}_${STAMP}"
mkdir -p "$OUT_DIR"

if [ -d "$ROOT_DIR/src-tauri/target/release/bundle" ]; then
  find "$ROOT_DIR/src-tauri/target/release/bundle" -type f -maxdepth 4 -print0 | while IFS= read -r -d '' artifact; do
    cp "$artifact" "$OUT_DIR/"
  done
fi

(
  cd "$OUT_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum * > SHA256SUMS.txt || true
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 * > SHA256SUMS.txt || true
  fi
)

cat > "$OUT_DIR/RELEASE_NOTES.md" <<EOF
# Diligent Code Studio v${VERSION}

Built with the Linux/macOS release helper.
EOF

if command -v zip >/dev/null 2>&1; then
  (
    cd "$RELEASE_ROOT"
    zip -r "DiligentCodeStudio_v${VERSION}_${STAMP}.zip" "$(basename "$OUT_DIR")"
  )
fi

echo "Release output: $OUT_DIR"
