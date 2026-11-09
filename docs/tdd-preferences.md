# Document appearance and selection TDD evidence

Defaults are Letter PDF pages, left-aligned display equation blocks, and 100% LaTeX size. A compact header Settings popover replaces the Local & offline chip. Math alignment applies to the entire display block; changing alignment leaves its PNG bytes unchanged. Math size applies to both inline and display equations. Preferences persist under `apetek.preferences.v1`, are validated against the UI choices, and remain usable when storage is blocked. Neither preference changes nor appearance rendering alter the Markdown source or its saved state.

## Executed RED cycles

| Slice | Narrow command / raw log | Observed failure before production changes |
| --- | --- | --- |
| Preference storage | `node --import tsx tests/preferences.test.ts`; `test-results/preferences-unit-red.log` | Deliberately new preferences module was missing. |
| Letter default | `node --import tsx --test tests/preferences.e2e.ts`; `test-results/preferences-letter-red.log` | Visible PDF page selector was `A4`, expected `Letter`. |
| Settings control | Name pattern `Document settings replaces`; `test-results/preferences-controls-selection-red.log` | Accessible settings button count was 0, expected 1. |
| Visible source selection | Name pattern `dragging source text`; `test-results/preferences-selection-red.log` | Actual screenshot pixels outside the dragged range were `[240,243,236,255]`, while the next clear line was `[251,252,250,255]`. |
| Newest math appearance | Name pattern `math settings update`; `test-results/preferences-math-red.log` | After selecting Center and immediately copying, rich HTML still described left-aligned equations because preferences were not yet passed to rendering. |

The initial selection-test attempt exposed a test serialization helper (`__name`), so it was repaired and rerun before the selection implementation. That setup error is not counted as RED. The successful RED measured a real mouse drag, its selection rectangle, and screenshot pixels.

## GREEN and verification

The storage unit passes, covering supported preferences, invalid values, malformed JSON cleanup, and storage exceptions. The Letter/control/selection integration slice passed 3/3 before wiring math rendering. After wiring preferences through the existing RevisionRenderer, `node --import tsx --test tests/preferences.e2e.ts` passed **5/5**, 0 skipped, 0 failed, in **39.42 seconds** (`test-results/preferences-all-green.log`).

The integration tests verify:

- Preferences survive a normal application quit and restart in the same isolated temporary profile. Malformed JSON resets to Letter/Left/100 and is replaced with valid stored preferences.
- Alignment changes preserve both equation PNG sources exactly; equations' internal alignment remains intact.
- At 150%, both inline and display PNG dimensions grow, while their natural pixel dimensions remain exactly three times the displayed width/height attributes. The actual clipboard PNG dimensions match the newest requested size after an immediate copy, without waiting for preview readiness before clicking.
- Appearance changes preserve clean document state and the exact saved Markdown bytes.
- Actual default Letter and centered 150% PDFs export successfully, retaining selectable body text. The existing multipage PDF regression now uses the default Letter setting directly.
- Mouse-drag selection geometry matches the chosen text range. Screenshot pixels show a visible selected range while unselected text on that line shares the next line's clear background.

Whole-project TypeScript checking, targeted ESLint, the preferences unit, and production build passed. Visual inspection of `preferences-settings.png`, `preferences-source-selection.png`, and the rendered pages of `preferences-left100.pdf` and `preferences-center150.pdf` confirmed the existing app layout, clear selection, whole-block alignment, sharp equations, and clean spacing. All proofs are in `test-results/`.

No unrelated refactoring was needed. The temporary profile tests do not access personal drafts.

Final complete Electron regression: **49/49 passed, 0 skipped, 0 failed**, in **86.87 seconds**. Raw output: `test-results/apetek-1.2.0-e2e-final.log`. This includes existing clipboard, PDF, scroll, security, recovery and file-service cases together with the new settings and visible-selection checks.
