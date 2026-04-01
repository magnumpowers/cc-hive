#!/bin/bash
# Creates a simple hexagon icon for cc-hive using macOS sips

ICON_DIR="/Users/magnuspaues/hive/desktop/cc-hive.app/Contents/Resources"
TEMP_SVG="/tmp/cc-hive-icon.svg"

cat > "$TEMP_SVG" << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0a0a0f"/>
  <polygon points="256,60 430,158 430,354 256,452 82,354 82,158" fill="none" stroke="#f59e0b" stroke-width="24" stroke-linejoin="round"/>
  <polygon points="256,120 380,188 380,324 256,392 132,324 132,188" fill="#f59e0b" fill-opacity="0.15"/>
  <text x="256" y="290" text-anchor="middle" font-family="SF Mono, monospace" font-size="120" font-weight="bold" fill="#f59e0b">H</text>
</svg>
SVG

# Convert SVG to PNG using Python (available on macOS)
python3 -c "
import subprocess, os

svg_path = '$TEMP_SVG'
png_path = '/tmp/cc-hive-icon.png'

# Use built-in qlmanage for conversion
subprocess.run(['qlmanage', '-t', '-s', '512', '-o', '/tmp/', svg_path],
               capture_output=True)

# If qlmanage didn't work, try sips
moved = f'{svg_path}.png'
if os.path.exists(moved):
    os.rename(moved, png_path)
    # Create icns
    iconset = '/tmp/cc-hive.iconset'
    os.makedirs(iconset, exist_ok=True)
    for size in [16, 32, 64, 128, 256, 512]:
        subprocess.run(['sips', '-z', str(size), str(size), png_path,
                       '--out', f'{iconset}/icon_{size}x{size}.png'], capture_output=True)
        if size <= 256:
            s2 = size * 2
            subprocess.run(['sips', '-z', str(s2), str(s2), png_path,
                           '--out', f'{iconset}/icon_{size}x{size}@2x.png'], capture_output=True)
    subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', '$ICON_DIR/icon.icns'])
    print('Icon created successfully')
else:
    print('SVG conversion failed, skipping icon')
"

rm -f "$TEMP_SVG"
