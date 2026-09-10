#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
VERSION="${1:-$(date +%Y%m%d-%H%M%S)}"
PACKAGE_NAME="wanvision-clean-$VERSION.tar.gz"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"
TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/wanvision"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$RELEASE_DIR" "$STAGE_DIR"

rsync -a "$ROOT_DIR/" "$STAGE_DIR/" \
  --exclude ".git/" \
  --exclude ".DS_Store" \
  --exclude ".github/" \
  --exclude ".idea/" \
  --exclude ".vscode/" \
  --exclude ".dev-logs/" \
  --exclude ".local/" \
  --exclude ".playwright-mcp/" \
  --exclude ".workbuddy/" \
  --exclude ".superpowers/" \
  --exclude ".claude/" \
  --exclude "node_modules/" \
  --exclude "backend/node_modules/" \
  --exclude "frontend/node_modules/" \
  --exclude "admin-console/node_modules/" \
  --exclude "frontend/.nuxt/" \
  --exclude "frontend/.output/" \
  --exclude "frontend/dist/" \
  --exclude "backend/dist/" \
  --exclude "admin-console/dist/" \
  --exclude "data/static/" \
  --exclude "data/storage/" \
  --exclude "data/*.db" \
  --exclude "data/*.db-*" \
  --exclude "data/*.sqlite" \
  --exclude "data/*.bak" \
  --exclude "backend/.env" \
  --exclude "admin-console/.env" \
  --exclude "admin-console/.env.development" \
  --exclude "admin-console/.env.staging" \
  --exclude "admin-console/.env.production" \
  --exclude "admin-console/.git/" \
  --exclude "admin-console/_tmp_*" \
  --exclude "release/" \
  --exclude "*.log" \
  --exclude "AGENTS.md" \
  --exclude "CLAUDE.md" \
  --exclude "toast-style-check.png" \
  --exclude "admin-frontend-audit-report.md"

COPYFILE_DISABLE=1 tar -czf "$PACKAGE_PATH" -C "$TMP_DIR" wanvision
shasum -a 256 "$PACKAGE_PATH" > "$PACKAGE_PATH.sha256"

echo "Package: $PACKAGE_PATH"
echo "SHA256:  $PACKAGE_PATH.sha256"
du -h "$PACKAGE_PATH"
