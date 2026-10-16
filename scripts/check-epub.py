#!/usr/bin/env python3
"""Structural checks on a built EPUB, run from make-epub.sh.

Four defects are easy to ship and hard to see, so they are checked here:

  1. a link whose fragment resolves to nothing (the TOC quietly does nothing);
  2. an image wider than the panel it is read on (it overflows, or a reader
     that ignores the stylesheet clips it);
  3. a verbatim block whose lines are wider than a reader can show, which
     silently rewraps and destroys anything whose meaning was its alignment;
  4. a table wider than two columns, which is the same failure in a
     different costume: the reader squeezes the columns, and a code identifier
     that no longer fits gets a hyphen inserted into the middle of it.

(3) is reported rather than failed: device output and long paths genuinely are
long, and wrapping them is the lesser evil. (4) fails at four or more columns,
which was measured on the device to be unusable, and reports three-column
tables whose cells hold an unbreakable token long enough to be hyphenated.

Usage: check-epub.py FILE.epub
"""
import hashlib
import os
import re
import struct
import sys
import tempfile
import zipfile

# Kindle Paperwhite 3 panel. Anything wider cannot fit on the target device.
PANEL_WIDTH = 1072
# Monospace characters that fit the text column at our body size.
PRE_LINE_LIMIT = 55


def main(path):
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(path) as z:
            z.extractall(tmp)

        files = []
        for root, _, names in os.walk(tmp):
            for n in names:
                if n.endswith((".xhtml", ".html")):
                    files.append(os.path.join(root, n))

        ids = {}
        for f in files:
            with open(f, encoding="utf-8", errors="replace") as fh:
                for m in re.finditer(r'\sid="([^"]+)"', fh.read()):
                    ids.setdefault(m.group(1), []).append(f)

        failed = False

        # ---- 1. links -------------------------------------------------
        broken, checked = [], 0
        for f in files:
            with open(f, encoding="utf-8", errors="replace") as fh:
                body = fh.read()
            for m in re.finditer(r'href="([^"]+)"', body):
                href = m.group(1)
                if href.startswith(("http:", "https:", "mailto:", "data:")):
                    continue
                checked += 1
                if href.startswith("#"):
                    if href[1:] not in ids:
                        broken.append((f, href))
                else:
                    dest, _, frag = href.partition("#")
                    target = os.path.normpath(os.path.join(os.path.dirname(f), dest))
                    if not os.path.exists(target) or (frag and frag not in ids):
                        broken.append((f, href))
        if broken:
            failed = True
            print(f"check-epub: {len(broken)} broken link(s) of {checked}")
            for f, href in broken[:20]:
                print(f"    {os.path.relpath(f, tmp)}  ->  {href}")
        else:
            print(f"check-epub: {checked} internal links, all resolve")

        # ---- 2. images ------------------------------------------------
        media = []
        for root, _, names in os.walk(tmp):
            for n in sorted(names):
                p = os.path.join(root, n)
                if p.lower().endswith(".png"):
                    with open(p, "rb") as fh:
                        head = fh.read(24)
                    if head[:8] == b"\x89PNG\r\n\x1a\n":
                        w, h = struct.unpack(">II", head[16:24])
                        media.append((n, w, h, os.path.getsize(p)))
        if media:
            print("check-epub: images")
            for n, w, h, size in media:
                note = ""
                if w > PANEL_WIDTH:
                    note = f"  <-- WIDER THAN THE {PANEL_WIDTH}px PANEL"
                    failed = True
                print(f"    {n:16} {w}x{h}  {size // 1024} KB{note}")
        else:
            print("check-epub: no images")

        # ---- 3. over-wide verbatim lines ------------------------------
        wide = []
        for f in files:
            with open(f, encoding="utf-8", errors="replace") as fh:
                body = fh.read()
            for m in re.finditer(r"<pre[^>]*>(.*?)</pre>", body, re.S):
                text = re.sub(r"<[^>]+>", "", m.group(1))
                for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                                     ("&quot;", '"'), ("&#160;", " ")):
                    text = text.replace(entity, char)
                worst = max((len(line) for line in text.split("\n")), default=0)
                if worst > PRE_LINE_LIMIT:
                    first = next((l for l in text.split("\n") if l.strip()), "")
                    wide.append((worst, os.path.relpath(f, tmp), first[:56]))
        print(f"check-epub: {len(wide)} verbatim block(s) with a line over "
              f"{PRE_LINE_LIMIT} characters (these rewrap)")
        for worst, f, first in sorted(wide, reverse=True)[:12]:
            print(f"    {worst:>3}  {f}  | {first}")

        # ---- 4. anchors that became stray empty paragraphs ------------
        stray = 0
        for f in files:
            with open(f, encoding="utf-8", errors="replace") as fh:
                stray += len(re.findall(r"<p><a id=\"[^\"]*\"></a></p>", fh.read()))
        if stray:
            failed = True
            print(f"check-epub: {stray} empty anchor paragraph(s) — put the anchor inside the heading")
        else:
            print("check-epub: no stray empty anchor paragraphs")

        # ---- 5. table width -------------------------------------------
        def cell_text(c):
            c = re.sub(r"<[^>]+>", "", c)
            for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                                 ("&quot;", '"'), ("&#160;", " "), ("&#8212;", "-")):
                c = c.replace(entity, char)
            return c

        wide_tables, risky_cells = [], []
        for f in files:
            with open(f, encoding="utf-8", errors="replace") as fh:
                body = fh.read()
            for m in re.finditer(r"<table\b.*?</table>", body, re.S):
                rows = re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), re.S)
                if not rows:
                    continue
                cols = [re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S) for r in rows]
                ncols = max(len(c) for c in cols)
                rel = os.path.relpath(f, tmp)
                head = " · ".join(cell_text(c) for c in cols[0])[:58]
                if ncols >= 3:
                    wide_tables.append((ncols, rel, head, max(
                        (tok for row in cols for c in row for tok in cell_text(c).split()),
                        key=len, default="")))
        if wide_tables:
            failed = True
            print(f"check-epub: {len(wide_tables)} table(s) with three or more columns — the "
                  f"reader squeezes them and hyphenates code identifiers; convert to a list")
            for ncols, rel, head, worst in sorted(wide_tables, reverse=True):
                print(f"    {ncols} cols  {rel}  | {head}   [longest token: {worst}]")
        else:
            print("check-epub: no table is wider than two columns")

        # ---- 6. content digest ----------------------------------------
        # The packaging stamps — the dc:date and the dcterms:modified time — are
        # rewritten on every build, so the file's own hash cannot tell you
        # whether the copy on the device is the one you just built. This digest
        # skips them, so two builds of the same source agree, and it is what to
        # compare after copying the book to a reader.
        digest = hashlib.sha256()
        for root, _, names in os.walk(tmp):
            for n in sorted(names):
                p = os.path.join(root, n)
                if os.path.basename(p) in ("content.opf", "toc.ncx"):
                    continue
                digest.update(os.path.relpath(p, tmp).encode())
                with open(p, "rb") as fh:
                    digest.update(fh.read())
        print(f"check-epub: content digest {digest.hexdigest()[:16]}")

        # ---- report ----------------------------------------------------
        if failed:
            print("check-epub: FAILED")
            return 1
        print("check-epub: ok")
        return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
