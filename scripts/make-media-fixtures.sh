#!/usr/bin/env bash
# Regenerates the small synthetic media files in fixtures/media (test pattern + tone,
# no third-party content). They are committed; rerun only to change them.
#   FFMPEG="ffmpeg" (default) or e.g. FFMPEG="docker run --rm -v $PWD:$PWD -w $PWD --entrypoint /ffmpeg mwader/static-ffmpeg:9.0.2"
set -euo pipefail
cd "$(dirname "$0")/../fixtures/media"
FFMPEG=${FFMPEG:-ffmpeg}
common=(-hide_banner -loglevel error -y)

# 2s vertical 720x1280 H.264 + AAC — the "happy path" phone video.
$FFMPEG "${common[@]}" -f lavfi -i "testsrc2=size=720x1280:rate=30:duration=2" -f lavfi -i "sine=frequency=440:duration=2" \
  -c:v libx264 -preset veryfast -crf 35 -pix_fmt yuv420p -c:a aac -b:a 48k -movflags +faststart -shortest vertical-2s.mp4

# Same, without an audio track.
$FFMPEG "${common[@]}" -f lavfi -i "testsrc2=size=720x1280:rate=30:duration=2" \
  -c:v libx264 -preset veryfast -crf 35 -pix_fmt yuv420p -movflags +faststart no-audio-2s.mp4

# Stored landscape 1280x720 with 90° display rotation, as phones record portrait video.
$FFMPEG "${common[@]}" -noautorotate -display_rotation 90 -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=2" -f lavfi -i "sine=frequency=330:duration=2" \
  -c:v libx264 -preset veryfast -crf 35 -pix_fmt yuv420p -c:a aac -b:a 48k -shortest rotated-2s.mp4

# 2s landscape WEBM (VP9 + Opus).
$FFMPEG "${common[@]}" -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" -f lavfi -i "sine=frequency=550:duration=2" \
  -c:v libvpx-vp9 -b:v 200k -deadline realtime -c:a libopus -b:a 32k -shortest landscape-2s.webm

# Not a video at all, despite the extension.
printf 'This is a text file pretending to be a video.\n' > not-a-video.mp4

ls -la
