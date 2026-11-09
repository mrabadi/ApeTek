# Desktop TDD evidence

- `node --import tsx tests/assets.e2e.ts` (desktop session): equation PNG test initially failed with `Equation image rendering is not implemented`.
- First implementation exposed a useful failure: PNG width 23 instead of 69. Chromium compositor capture at explicit scale 3 corrected it. Same test passed with alpha, ink, dimensions, and inline descent assertions.
- Added OS clipboard test. Same command failed with `Rich copy is not implemented` before implementing the Electron ClipboardItem HTML/plain write.

Tests require access to the real graphical session. The restricted shell sandbox prevents Electron startup; that launch error is environment setup, not a valid RED.

The rich clipboard focused check subsequently passed with native `text/html` and `text/plain`, embedded PNGs, an editable table, and no whole-document image flavor.

Further observed cycles:

- Multi-equation preview initially stalled after the first screenshot. Real editor test timed out with the second formula present on the hidden raster surface. Offscreen Chromium rendering removed the stall; the real editor test passed.
- Mermaid request was originally interpreted as math text and returned a nonzero inline descent. The diagram test failed `10 !== 0`; the dedicated bundled Mermaid renderer passed afterward. Invalid KaTeX rejects without poisoning the render queue.
- Inline equation assets initially lacked a Writer-compatible copy image. The test failed `inline math includes a Writer-compatible image`; separate transparent baseline-centered bitmap generation passed. The preview image remains tightly cropped.

The final raster pipeline uses Chromium compositor capture at explicit scale 3, with local fonts loaded before measurement. A separate inline copy bitmap plus legacy middle alignment was verified through actual Writer paste and visual PDF inspection.
