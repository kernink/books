# AGENTS.md

Guidance for agentic contributors to this repository. **Read the entry's own `README.md` first** —
for the Kindle book that is `the-kindle-from-the-panel-up/README.md`, which holds the house rules
for the prose.

This file deliberately holds **no status**. It is the durable layer: invariants, red lines, and
conventions.

---

## The repository is public

Everything committed here is published. Two consequences:

- **Never commit a build artifact or a capture.** `kernink.epub` and
  `the-kindle-from-the-panel-up/figures/shots/` are gitignored for exactly this reason. Never
  publish a framebuffer capture: captures have contained a live Wi-Fi network-info dialog with the
  device's MAC and IP.
- **Never commit anything that ties this repo to one physical device or one network.** The masking
  convention — `<key>`, `<port>`, `<device-ip>`, `<host-ip>`, `<gateway>`, `<ssid>`, `<masked>` — is
  documented in `the-kindle-from-the-panel-up/99-references.md`.

Run the guard before proposing a commit:

```sh
./scripts/check-public.sh
```

`check-public.sh` catches *patterns*, **not names**. A hostname, an SSID or a person's handle is not
a pattern, so a clean run means "nothing mechanical slipped through", not "safe to publish". **Read
the diff.**

Nothing in this repository writes to a device. Every device claim in the book came from a read-only
probe and says so. Probing, and the red lines that govern it, belong to the project — not here.

---

## Editing a book

A book is read on the hardware it describes, so how it renders is part of correctness. Three
invariants; `check-epub.py` fails the build on the first two:

- **No table wider than two columns.** In a third column a narrow reader hyphenates long tokens
  (`CONFIG_THERMAL_OFF` → `CON-FIG_THERMAL_OFF`), which is no longer the string. Use a list. Do not
  "fix" a failing build by relaxing the check.
- **No image wider than the panel.** Figures render at 992 px against a 1072 px panel.
- **Nothing whose meaning is its alignment.** Device transcripts stay verbatim as `pre` — their
  over-wide lines are *reported*, not failed, because they are evidence. Authored diagrams, column
  grids and ASCII art do not survive and must become lists.

Load-bearing build details, not to be changed casually:

- `metadata.yaml` pins the `identifier:` UUID. Without it, every build is a *different book* to
  readers that key on identifiers, and reading positions are lost.
- pandoc runs with `--from=markdown-smart-implicit_figures`: smart **and** implicit figures are both
  off.
- The TOC fix depends on a raw `<a id="chNN"></a>` appended **inside** the `# ` heading line, not on
  its own.

**The identity of a build is its content digest — never its md5 or its size.** `check-epub.py` prints
it; it skips `content.opf`/`toc.ncx` so two builds of the same source agree, which is what lets you
prove a copy sitting on a device is the build you just made.

A build is not verified until it has been rebuilt and read. `./make-epub.sh` runs the public-file
guard, pandoc and the EPUB checks in one go.

---

## Figures

House style: the object *is* the explanation. An invented real machine mapping 1:1 to the concept,
many small precise parts, four-tone shading, correct painter's order, a framed card (Fig n / title /
hint / live readout), calm eased motion, exactly one `lit` accent. No abstract block diagrams. Each
figure is a `.mjs` source plus `-light.png` (the target theme), a standalone `.svg` and an
interactive `.html`.

After changing one: rebuild, run the line check, capture, and **read the PNG**. Do not claim a figure
renders correctly without looking at it.

---

## When you change something, update what describes it

- Book prose rules and layout constraints → that book's `README.md`
- Durable rules and red lines → this file
- Current state of a book, and of the project it belongs to → the project, not this repository
