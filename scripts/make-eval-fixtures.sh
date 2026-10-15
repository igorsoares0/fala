#!/usr/bin/env bash
# Generates the seed clips of the transcription evaluation set (fixtures/eval) with
# espeak-ng synthetic speech inside a Debian container — no third-party recordings.
# Synthetic voices are only a smoke test; add real CC0 clips (e.g. Common Voice) for
# accents, noise and music. See README "Evaluating transcription".
set -euo pipefail
cd "$(dirname "$0")/../fixtures/eval"

docker run --rm -v "$PWD:/out" -w /out debian:bookworm-slim bash -euc '
  apt-get update -qq >/dev/null && apt-get install -y -qq espeak-ng ffmpeg >/dev/null
  make_clip() { # name voice text
    espeak-ng -v "$2" -s 150 -w "/tmp/$1.wav" "$3"
    ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x1d1b18:s=360x640:r=24" -i "/tmp/$1.wav" \
      -c:v libx264 -preset veryfast -crf 38 -pix_fmt yuv420p -c:a aac -b:a 64k -shortest "$1.mp4"
  }
  make_clip en-synthetic en-us "Captions help people follow your video without sound. Every word appears right when it is spoken."
  make_clip es-synthetic es "Los subtítulos ayudan a seguir tu video sin sonido. Cada palabra aparece justo cuando se dice."
  make_clip de-synthetic de "Untertitel helfen, dein Video ohne Ton zu verstehen. Jedes Wort erscheint genau dann, wenn es gesprochen wird."
  make_clip fr-synthetic fr "Les sous-titres aident à suivre ta vidéo sans le son. Chaque mot apparaît au moment où il est prononcé."
'
ls -la
