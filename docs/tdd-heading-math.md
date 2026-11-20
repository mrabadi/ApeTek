# Heading equation scaling: RED, GREEN, verification

## Behavior

Version 1.3.8 sizes equations in H1-H6 according to the heading's size relative
to ordinary text. The existing LaTeX size setting multiplies that factor.
Setext headings and math nested inside heading emphasis, links, and parsed
Markdown within raw HTML wrappers use the same rule. Body equations, display
blocks outside headings, diagrams, and source Markdown keep their behavior.

The preview's existing heading text sizes remain 32, 21, 18, 15, 12.45, and
10.05 pixels against a 15-pixel body. Trusted relative heading styles preserve
those ratios in rich copy and PDF. The clipboard converts those heading sizes
to explicit points for Writer; standalone headings without those styles retain
their existing copy defaults.

## Verified RED

Before changing the renderer, the focused core test failed on H1 using the
body equation font size:

```sh
node --import tsx --test --test-name-pattern='heading equations scale' tests/markdown.test.ts
```

Evidence: `test-results/heading-math-core-red.log`. An initial sandbox runner
failure was not counted; the host runner produced the intended assertion.

The actual Electron regression against the previous production build also
failed: H1's equation was 19 pixels wide, while the surrounding 32-pixel heading
required a 36-pixel raster. Evidence: `heading-math-electron-red.log`.

The detached full/partial-copy test failed because a proportional H1 remained
in em units instead of portable points. Evidence: `heading-math-clipboard-red.log`.
Setup-only failures were repaired before recording this meaningful RED.

## GREEN and refactoring

The renderer carries the nearest heading scale through the sanitized HTML tree
and applies it to the raster request's font size. It rerenders the PNG at the
correct size, retaining three-times density and newly measured baseline/copy
metrics. The existing cache already keys by font size. Clipboard normalization
converts explicit heading em sizes against its existing 12-point body size.

The same focused core, Electron, and clipboard regressions pass. No further
abstraction or unrelated refactoring was needed. Existing spacing tests now
expect the trusted heading size instead of asserting that headings have no
inline style; their actual preview font sizes remain independently checked.

## Verification

- Unit suite: 50/50, including all six heading levels at 100%, 137%, and 200%.
- Actual Electron regression: 1/1 at 100% and 137%, including repeated and
  emphasized formulas, exact raster dimensions/content, cache reuse,
  three-times PNG density, inline baselines, and unchanged heading typography.
- Detached full and image-only partial copy: 2/2, all six levels at 100% and
  137%, retaining heading wrappers, embedded PNG bytes, padded dimensions,
  baseline metadata, and unchanged source DOM.
- Existing clipboard browser suite: 20/20.
- TypeScript, ESLint, and production build pass.
- The real PDF export retains selectable Body/H1-H6 text and nine equation
  images. PDF font ratios match the preview; embedded image dimensions retain
  three-times CSS density and all graphics lie within the page. The exported
  page was rendered with system Poppler and visually inspected. The bundled
  Poppler executable needed a newer glibc, so it was not used for visual QA.

These tests do not write to the user's OS clipboard. The full native Writer
suite is not rerun for this change; existing copy-image padding and alignment
are preserved and covered by the targeted tests above.

Logs and screenshots are included in `outputs/verification/1.3.8/` in the local
delivery. Packaging metadata also has a separate verified RED/GREEN contract.
