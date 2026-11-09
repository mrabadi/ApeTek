# Writer spacing and clipboard protection — version 1.3

The real clipboard acceptance now covers default line spacing 1 and a 13-pixel paragraph gap, then chosen line spacing 2 and a 24-pixel gap. Both settings must survive the actual Writer paste, ODT save/reopen, and PDF export. Math preferences still control complete display blocks and image size, with the new 100% baseline equal to the previous 75% size.

## RED and GREEN

The inherited ODT style inspector first failed because the new line-height report was absent (`undefined` rather than `200%`). After resolving paragraph properties through inherited and default styles, its focused fixture passed for line height and bottom margin as well as existing alignment and PNG dimensions. This check uses a synthetic archive and never touches the clipboard.

Against the unchanged 1.2 build, the real Writer case failed because the copied paragraph had `150%` line height instead of `100%`. The failure occurred after actual paste and reopen, before trying the new controls. Evidence: `test-results/writer-line-spacing-red.log`.

The complete final Writer suite passed with six tests, zero failures or skips, in 24.92 seconds. It verifies both spacing choices through inherited ODT paragraph styles, equation alignment and slider size, preserved baseline placement, accurate three-times PNG density and physical frame dimensions, editable prose, and actual save/reopen text/graphic/table comparisons. Evidence: `test-results/apetek-1.3.0-writer-final.log`.

## Test clipboard guard

The guard's fake boundary tests first failed to restore an initial fixture or recognize a newer external copy. The minimal in-memory guard then passed restoration, newer-copy preservation, and zero clipboard access when no copy occurs. A further fake native-format normalization case failed with `skipped-newer-copy`; recording the normalized native representation immediately after the completed own write made that case pass too. These four tests perform no operating-system clipboard operations.

The guard is installed by shared Electron test helpers and by the single isolated process used for the Writer suite. Initial clipboard entries are materialized only before the first explicit own write. Their content remains in main-process memory and is never logged or serialized. At teardown, byte comparison against the last native snapshot protects a newer user copy. Clipboard assertions in the Writer test also return only booleans to the test runner.

The final real Writer run reported `Writer clipboard restoration: restored`. The earlier native RED conservatively skipped restoration before normalization support; it was not reported as successful restoration.

## Proofs

Versioned artifacts are under `test-results/apetek-1.3.0-writer/math-left-100/` and `math-center-150/`. Their PDFs are exported from the reopened documents. The corresponding reports include line height, paragraph margins, raster and frame dimensions, and actual reopened text/graphic/table comparisons.

Both PDFs were rendered to PNG and inspected. The smaller default math sits naturally in editable prose; the selected larger math, centered block, increased line spacing, and 24-pixel paragraph gap retain their appearance after reopening. Full TypeScript and ESLint checks and Python compilation passed after the final test/harness changes.
