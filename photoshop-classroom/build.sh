#!/usr/bin/env bash
# Builds the downloadable files in download/:
#   LessonRecorder.ccx              double-click installer for Photoshop
#   Photoshop-Lesson-Recorder.zip   installer + sample lesson + backup plugin folder + START HERE
set -euo pipefail
cd "$(dirname "$0")"
OUT=download
STAGE=$(mktemp -d)
mkdir -p "$OUT"
rm -f "$OUT/LessonRecorder.ccx" "$OUT/Photoshop-Lesson-Recorder.zip"

# .ccx = the plugin folder zipped with manifest.json at the root
(cd plugin && zip -qrX "../$OUT/LessonRecorder.ccx" . -x '*.DS_Store')

PKG="$STAGE/Photoshop Lesson Recorder"
mkdir -p "$PKG"
cp "$OUT/LessonRecorder.ccx" "$PKG/1 - Double-click to install - LessonRecorder.ccx"
cp -R sample-lessons/soft-glow "$PKG/2 - Sample Lesson - Soft Glow"
rm -f "$PKG/2 - Sample Lesson - Soft Glow/assets/.gitkeep"
mkdir -p "$PKG/3 - Backup install (UXP Developer Tool)"
cp -R plugin "$PKG/3 - Backup install (UXP Developer Tool)/plugin"
cp "START HERE.txt" "$PKG/START HERE.txt"
(cd "$STAGE" && zip -qrX "$OLDPWD/$OUT/Photoshop-Lesson-Recorder.zip" "Photoshop Lesson Recorder")
rm -rf "$STAGE"
ls -la "$OUT"
