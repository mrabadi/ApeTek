# Math display and size settings: TDD evidence

Implemented with the requested TDD skill, one behavior per RED → GREEN cycle.

## Display alignment

Added a renderer test covering default left alignment, explicit centering, inline
math, an internal `aligned` TeX environment, and a Mermaid diagram. Executed
`node --import tsx tests/markdown.test.ts` before changing production code: the new
test failed because the expected left-alignment metadata was absent (0 versus 1).

Added `RenderOptions.mathAlignment` and applied alignment only to the display
image's outer margin and trusted clipboard metadata. The same command passed all
14 tests. Exact raster-request comparisons also verify that changing alignment
does not alter TeX source or add KaTeX alignment options; Mermaid is unchanged.

## Global math size

Added coverage for default size, 75%, 90%, 100%, 150%, and 200%, plus non-finite and
out-of-range values. The raster boundary returns corresponding image dimensions
and padded inline-copy metrics. Updated the existing default request expectation
to include the 17px font size. Executed the renderer tests: two tests failed because
math raster requests had no `fontSize`.

Added finite 75–200% validation with a 100% fallback, passing `17 * scale / 100` to
both inline and display math raster requests. Mermaid requests retain their
original shape. All 15 renderer tests passed. Exact request assertions ensure size
changes affect only the math font size, while source and display mode are retained.

## Rich copying

Added an integrated renderer plus real Chromium DOM test for left/100% and
center/150%. It exercises full copying and a selected display image, checking
paragraph alignment, scaled inline/display dimensions, padded inline PNG baseline
metadata, Mermaid centering, removal of internal metadata, and an unchanged tight
preview image.

Executed `node --import tsx tests/clipboard.e2e.ts`: the new test failed because the
left-aligned equation was serialized into a centered paragraph. Read trusted math
alignment before attribute cleanup and use it for the image's copy paragraph. The
same command passed all 13 tests, including existing untagged display-image and
diagram centering cases. Chromium needed sandbox escalation on this host; these
tests do not write the operating system clipboard.

## Verification scope

Focused TypeScript and ESLint checks pass for the renderer, clipboard function,
shared types, and their tests. This work does not build the application or exercise
the actual Writer clipboard, PDF export, or UI settings controls; those integration
checks are handled separately.
