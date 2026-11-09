# Layout controls: TDD evidence

Implemented with the requested TDD skill in focused RED → GREEN cycles. Commands
were run from the project directory. No build, Electron launch, actual clipboard
write, or output packaging was performed for this core work.

## Smaller math baseline and precise percentage range

Adjusted the existing observable raster-request tests to expect a 12.75px default
instead of 17px, with integer scale values from 50% through 200%, including 137%.
Non-finite, fractional, and out-of-range values fall back to 100%. Executed
`node --import tsx tests/markdown.test.ts`: three tests failed because requests
still used 17px at the default size.

Changed the base to 12.75px and validated integer percentages within 50–200.
The same command passed all 15 tests. New 100% therefore sends exactly the same
font-size request as the previous 75%; math source, display mode, alignment, and
Mermaid requests remain unchanged. Existing raster and inline-copy dimensions are
retained from the raster boundary.

## Prose line and paragraph spacing

Added a test for paragraphs, list items, table cells, and table headers. It covers
default single spacing with a 13px paragraph after-gap; chosen 1.5/24px; accepted
boundaries; and safe fallbacks for invalid values. It also verifies heading and
code typography is unchanged and raw HTML styles cannot override trusted values.
Executed the renderer tests: the new test failed because paragraphs had no
configured line-height.

Added optional `lineSpacing` (finite 1–3, default 1) and `paragraphSpacing` (finite
0–40px, default 13). Trusted styles are applied after sanitization. Paragraphs use
`line-height:<value>;margin:0 0 <gap>px;`; list items and table cells/headers carry
the line-height. Updated source-anchor assertions to permit the new style
attribute while still checking exact source line ranges. All 16 tests passed.

## Abort obsolete renders

Added a controlled pending-first-equation test. After the first raster request
starts, the test aborts the signal and releases that request. The renderer must
reject with `AbortError`, never request the second equation, and make no requests
when the signal is already aborted. Executed the renderer tests: the new test
failed with “Missing expected rejection (AbortError).”

Added `RenderOptions.signal`, checked on entry, after parsing, before each image,
and after async raster/image work. The asset error handler preserves cancellation
instead of converting it into an equation error placeholder. All 17 tests passed.
An in-progress external raster operation may finish; subsequent assets are not
requested by the cancelled render.

## Preserve spacing in full and partial rich copy

Added a real Chromium DOM test that renders default and chosen prose spacing,
then copies the whole document and a selected paragraph fragment. It verifies
exact line-height, one normalized paragraph margin, editable selected text,
unchanged preview DOM, and retained heading/code typography. An initial browser
evaluation setup error was fixed before establishing RED. The next execution of
`node --import tsx tests/clipboard.e2e.ts` failed because copied paragraphs had two
conflicting margin declarations (2 versus 1).

Normalized copy-safe defaults through the DOM style API, then restored explicit
trusted source values over those defaults. Added single spacing and a 13px after
gap for unstyled prose. The same command passed all 14 tests.

Added a separate regression for a block image inside an existing styled prose
paragraph. The test failed because block transport reset line-height 1.5 to empty
and margin `0 0 24px` to `10pt 0`. Restricted the transport margin to newly created
math wrapper paragraphs and set alignment without replacing existing paragraph
styles. All 15 Chromium tests passed. Standalone math wrappers retain their prior
`10pt 0` margins; preview math margins and Mermaid layout remain independent of
prose spacing.

Focused TypeScript and ESLint checks pass for the shared types, renderer,
clipboard formatter, and their tests.

Chromium tests use isolated headless DOMs and required sandbox escalation on this
host. They do not access the operating system clipboard. Native Writer, UI
debouncing, preference migration, and PDF acceptance are tested separately.
