#!/bin/bash
# Install Hive as a macOS app

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_SRC="$SCRIPT_DIR/Hive.app"
APP_DEST="$HOME/Applications/Hive.app"

echo ""
echo "  ⬡ Installing Hive..."
echo ""

# Save project path so the app can find it
echo "$PROJECT_DIR" > "$HOME/.hive-path"

# Create ~/Applications if it doesn't exist
mkdir -p "$HOME/Applications"

# Remove old version
rm -rf "$APP_DEST"

# Copy app bundle
cp -R "$APP_SRC" "$APP_DEST"

# Make launcher executable
chmod +x "$APP_DEST/Contents/MacOS/launch"

# Clear quarantine flag
xattr -cr "$APP_DEST" 2>/dev/null

echo "  ✓ Installed to $APP_DEST"
echo "  ✓ Project directory: $PROJECT_DIR"
echo "  ✓ You can find Hive in Spotlight or Launchpad"
echo ""
echo "  To uninstall: rm -rf '$APP_DEST' ~/.hive-path"
echo ""
