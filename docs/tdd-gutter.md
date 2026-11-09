# ApeTek 1.3.1: line-number alignment

The reported bug was reproduced in the real Electron editor. Gutter labels were
25px below their matching source text, including rows after wrapped lines.

## RED

Added `tests/gutter.e2e.ts`, which compares actual source and line-number glyph
rectangles at the top, through wrapping and blank lines, in the virtualized middle
of a long document, after narrowing the split, and at the bottom. The test excludes
CodeMirror's zero-height gutter spacer and compares the first visual row of each
logical source line. Its fixture contains 130 lines and exercises two- and
three-digit numbers at an 880px window width.

Executed against the existing 1.3.0 build:

```sh
GUTTER_CAPTURE_PREFIX=gutter-red node --import tsx --test --test-concurrency=1 tests/gutter.e2e.ts
```

`test-results/gutter-red.log` records the intended assertion failure: every
measured visible row had an offset of exactly 25px. A before screenshot is
`test-results/gutter-red-top.png`. No production CSS had been changed.

## GREEN

Removed only `padding:25px 0 80px` from `.cm-gutters` in
`src/renderer/style.css`. CodeMirror already positions and sizes gutter elements
from its measured content padding. The extra outer padding displaced the labels.
Source padding, horizontal gutter spacing, fonts, selection colors and editor
scroll behavior remain unchanged. No manual per-line offsets or dependency
changes were introduced.

Built with `node --import tsx scripts/build.mjs`, then reran:

```sh
node --import tsx --test --test-concurrency=1 tests/gutter.e2e.ts
```

`test-results/gutter-green.log` records 1/1 passing. Each stage requires at least
five measured visible rows, every glyph offset within 1px, a long wrapped row,
middle-document virtualization and the final nonblank source row. The bottom
stage scrolls the actual scrollbar to its endpoint rather than relying on a
caret-navigation command to reveal the editor's trailing padding.

Visual inspection of `gutter-{top,middle,resized,bottom}.png` confirms correctly
aligned labels, including blank lines and the first visual row of long lines.

## Refactor and verification

No further production refactoring was needed for this one-property CSS fix.
The final broader checks and packaged launch results are recorded separately
in `outputs/verification/1.3.1/Test results.txt` in the delivered files.

Desktop tests use an isolated temporary profile and the existing clipboard guard.
The focused gutter test performs no clipboard operation. The local supported
Node.js 24 runtime and host graphical execution were used because workspace
sandbox restrictions prevent Electron launches and some subprocess fixtures.
