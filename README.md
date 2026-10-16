# kernink books

The research books of the [kernink](https://github.com/kernink) project. A book is a top-level
directory, and the directory name is the book's slug.

## The Kindle, From the Panel Up

A device-specific architecture reference for building e-ink-native software: sixteen chapters on
the hardware, boot, kernel, display and EPDC, input and multitouch, power and sleep, the userspace
stack, storage, the wider ecosystem and its licences, the build and deployment path, and finally
what all of it implies for the architecture that will run on it.

It is device-specific on purpose. Where the public record and the device disagreed, the device
won, and the write-up says which is which.

- Read it: [`the-kindle-from-the-panel-up/README.md`](the-kindle-from-the-panel-up/README.md)
- Build the EPUB: `cd the-kindle-from-the-panel-up && ./make-epub.sh`
- The isometric figures:
  [`the-kindle-from-the-panel-up/figures/`](the-kindle-from-the-panel-up/figures/)

The figure PNGs are committed, so the build needs nothing but `pandoc`. `node figures/render.mjs`
re-renders them, and is only needed after changing a `.mjs`.

## Adding a book

One directory per book, holding its chapters, a `README.md` with its own table of contents and
prose house rules, a `metadata.yaml` that pins its `identifier:`, and a `make-epub.sh`. The
existing entry is the template. Conventions are in [`AGENTS.md`](AGENTS.md).

## Licence

MIT.
