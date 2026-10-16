#!/bin/sh
# Assemble the book into an EPUB, with the figures.
#
#   ./make-epub.sh            # build ../<book>.epub, the committed release
#   ./make-epub.sh out.epub   # build somewhere else
#
# Needs pandoc (3.x). The figure PNGs must already exist; render them with
# `node figures/render.mjs`.
set -eu

cd "$(dirname "$0")"
# The entry is named after the book, so the artifact is too. Nothing below
# hardcodes a book name: copy the entry for the next one.
book=$(basename "$(cd .. && pwd)")
out="${1:-../$book.epub}"

chapters="README.md 00-preface.md 01-hardware.md 02-boot-and-firmware.md \
03-kernel-and-device-model.md 04-display-and-epdc.md 05-input-and-gestures.md \
06-power-sleep-and-thermal.md 07-userspace-and-rendering-stack.md \
08-storage-filesystem-and-config.md 09-ecosystem-and-prior-art.md \
10-toolchain-and-deployment.md 11-implications-for-kernink.md \
12-opportunities-and-horizons.md 99-glossary.md 99-references.md"

../../scripts/check-public.sh

# pre-flight: every referenced image must exist, or pandoc quietly ships a
# broken link and the reader shows a placeholder
missing=0
for image in $(grep -ho '](figures/[^)]*)' $chapters | sed 's/^](//; s/)$//'); do
  if [ ! -f "$image" ]; then
    echo "missing image: $image" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "render the figures first: node figures/render.mjs" >&2
  exit 1
fi

pandoc \
  --from=markdown-smart-implicit_figures \
  --to=epub3 \
  --metadata-file=metadata.yaml \
  --toc --toc-depth=2 \
  --split-level=1 \
  --css=epub.css \
  --resource-path=. \
  --syntax-highlighting=monochrome \
  -o "$out" \
  $chapters

../../scripts/check-epub.py "$out"
echo "wrote $out"
