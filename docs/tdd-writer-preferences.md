# Writer equation preferences and persistence

The acceptance contract is real Linux clipboard paste into a disposable LibreOffice Writer process. Prose remains editable, equation PNGs remain embedded, and the saved ODT must retain its content after closing and reopening. Display equation blocks default to left alignment at 100%; selecting center and 150% must survive the same copy and persistence path.

## Verified RED cycles

The ODT inspector regression first failed because paragraph alignment was absent (`undefined` instead of `center`). The minimal inspector change resolves inherited paragraph styles and reports PNG pixel dimensions. Both inspector cases then passed.

The new real Writer preference case ran against the unchanged 1.1 build and failed with actual display paragraph alignment `center`, expected `left`. This happened after actual clipboard paste, before any attempt to use the new settings controls. Evidence: `test-results/writer-settings-red.log`.

The persistence regression then failed with “the saved ODT must be reopened in Writer before acceptance.” Evidence: `test-results/writer-reopen-red.log`. The harness previously inspected the saved archive without reopening its document component.

## GREEN

The harness now saves and closes the disposable document, loads its ODT into a fresh component, compares actual editable text and named graphic/table collections, and exports the PDF from the reopened component. No existing user document or normal LibreOffice profile is involved.

The complete Writer suite passed with six tests, zero failures or skips, in 23.79 seconds. The preference case verifies default left alignment and chosen center alignment, inline baseline placement, exact three-times raster density, matching preview/raster/Writer frame widths, preserved padded image heights, and larger equations at 150%. Evidence: `test-results/apetek-1.2.0-writer-final.log`.

An initial size assertion incorrectly assumed that a tightly cropped equation bitmap must be exactly 1.5 times wider at 150%. The rasterizer includes constant two-pixel padding on each side, rounded capture bounds, and glyph layout. Observed inline widths were 62 and 90 CSS pixels; display widths were 174 and 260. The assertion was corrected to compare the actual chosen preview dimensions and natural pixels with the copied PNG and Writer's physical frame size. Rendering tests separately verify the requested font size. No production change was made to satisfy the incorrect bitmap-ratio assumption.

## Visual and broader verification

The left/100% and center/150% PDFs were rendered to PNG and inspected after reopening. The complete display block moves as requested while the TeX `aligned` structure keeps its internal alignment. Inline math remains on its sentence baseline, and the surrounding prose retains its size and editability.

Proofs are in `test-results/apetek-1.2.0-writer/math-left-100/` and `math-center-150/`, each containing its ODT, reopened PDF, semantic report, and inspected page PNG. The full TypeScript and ESLint checks and Python compilation check passed after the harness changes.
