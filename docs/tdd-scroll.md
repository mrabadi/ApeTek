# Scroll synchronization TDD evidence

The focused command throughout was `node --import tsx tests/scroll.test.ts`. Every production change followed the corresponding executed failing test.

| Behavior | Observed RED | Observed GREEN |
| --- | --- | --- |
| Anchored interpolation | `ERR_MODULE_NOT_FOUND` for the deliberately new `src/core/scroll` module. | Matching block positions interpolate in both directions. Positions beyond the scrollable region clamp to exact top/bottom endpoints. |
| Duplicate/nested geometry | Deep-equality failure: unordered, duplicate, crossing and non-finite coordinates survived normalization. | Sorted strictly increasing source/preview points drop ambiguous or invalid geometry. A bidirectional roundtrip sweep passes. |
| Empty/degenerate geometry | `Cannot read properties of undefined (reading 'source')`. | Empty anchors, one anchor, invalid extents, zero scroll ranges and NaN positions produce finite safe values. |
| DOM binding | `ERR_MODULE_NOT_FOUND` for the new `src/renderer/scroll-sync` module. | Source and preview scroll to corresponding blocks; multiple scroll events share one animation frame; programmatic scroll events do not bounce back. |
| Layout refresh and cleanup | Observer assertion failed: panes were not observed. | Image-load and ResizeObserver changes recompute positions while retaining the editor's source location. Destroy cancels pending frames, disconnects observers and removes listeners. |
| Disabled synchronization | Preview moved to 0 instead of retaining independent position 600. | Disabled panes remain independent; refresh after re-enabling restores anchored synchronization; non-scrollable geometry does not move the preview. |

Initial focused result: **6 tests passed, 0 failed**. A later integration regression increased the intermediate suite to **7 tests passed, 0 failed**; the later geometry regression brings the final suite to **8 tests passed, 0 failed**. The small refactor moved the per-frame anchor array into local scope; the same six tests passed afterward. Targeted TypeScript checking and whole-project `npm run typecheck` passed.

The DOM tests use deterministic geometry, animation-frame, and ResizeObserver fixtures around the real binding. They do not claim native GNOME/Wayland or live CodeMirror layout verification; those belong to the application integration tests.

Integration contract:

- `normalizeAnchors(anchors, sourceMax, previewMax)` and `interpolateScroll(anchors, position, direction)` provide the pure mapping.
- `bindScrollSync(editor, preview, isEnabled)` returns `refresh(direction?)` and `destroy`. Without a direction, refresh preserves the last scroll driver.
- Preview blocks carry one-based `data-line` and inclusive `data-end-line` source coordinates. Starts and ends map to CodeMirror line-block tops/bottoms plus document padding; wrapped source lines therefore use actual editor geometry.
- Call `refresh('source')` for CodeMirror document changes. Call `refresh()` after committed preview renders, splitter updates, and viewport/geometry changes. The helper also observes editor/preview size and descendant image loads.
- Mapping includes `(0,0)` and both panes' maximum scroll positions. Nested blocks that would create a backward mapping are discarded rather than making scrolling reverse direction.

A real CodeMirror integration test exposed preview-to-source scroll bouncing after reaching the document end. The new deterministic RED test set source=1000/preview=2000, scrolled preview to 0, then delivered a layout refresh before the animation frame. Source incorrectly stayed 1000 (`1000 !== 0`). The fix keeps an already scheduled frame's origin when geometry notifications arrive; that frame already remeasures anchors. All seven helper tests passed afterward, including image-layout anchoring.

The completed app then passed `node --import tsx --test --test-name-pattern='(scrolling follows|fresh undo history)' tests/editor.e2e.ts`: **2 passed, 6 skipped, 0 failed**. The live scroll case verifies preview top maps to editor top and editor end maps to preview end before and after pane resizing; bounds were not relaxed. The other focused case verifies the root agent's separate undo-history fix.


The pending-frame-only fix above proved incomplete when a full application suite delivered geometry notifications after the preview frame had completed. A second regression failed with preview position **450 instead of 600** after a later source-geometry change. `refresh(direction?)` now retains the last scroll driver for every layout refresh; only an explicit document edit selects the source driver. Observer and image-load callbacks call the default refresh. The root editor listener passes `'source'` for `docChanged` and uses the default for viewport/geometry updates.

Final verification of this correction:

- **8 helper/core tests passed**.
- The unchanged real scroll case passed **three consecutive focused runs**, with case durations 3.62 s, 3.57 s, and 3.54 s.
- The final complete Electron suite passed **42/42 cases, 0 skipped, 0 failed**, in 49.57 s, including bidirectional scrolling in the full sequence, resizing, rich clipboard copying, security and desktop services.
- Whole-project TypeScript and targeted ESLint passed. Failure-only source/preview top/max/viewport metrics remain in the real scroll case to make any future regression diagnosable.

## Pending caret scrolling during the ApeTek regression run

The renamed application's complete suite exposed a further intermittent reverse-scroll conflict: source remained at 9292/9293 and preview at 12820/12825 after navigating the preview to its top. An isolated DOM-assignment trace reproduced the order: the binding assigned source top 0, then CodeMirror restored 9292.1875 milliseconds later. Captured call stacks identify `DocView.scrollIntoView` through `EditorView.measure`/`onScrollChanged` as the restoring caller. The pending keyboard caret scroll, rather than anchor interpolation, could override the newly mapped source position.

The focused regression simulates that public CodeMirror boundary: an end-caret scroll remains pending, preview navigation maps source to 0, then the deferred measure applies its target. Before implementation, `node --import tsx tests/scroll.test.ts` failed with **1000 instead of 0** (`test-results/apetek-scroll-snapshot-red.log`).

After assigning a preview-driven source position, the binding dispatches `editor.scrollSnapshot()` as an effect. This public API replaces the pending caret scroll with the current mapped source offset while retaining the selection. The identical suite passed **9/9** (`test-results/apetek-scroll-snapshot-green.log`). No rounding thresholds, focus changes, or private CodeMirror fields were added. TypeScript and focused ESLint passed before rebuilding.

The unchanged real scroll case passed three consecutive focused runs (4.12 s, 4.41 s, 4.07 s total runner durations). Logs are `test-results/apetek-scroll-snapshot-ui-1.log`, `-2.log`, and `-3.log`. The complete renamed-app suite then passed **43/43 cases, 0 skipped, 0 failed**, in **49.29 s**; raw output is `test-results/apetek-e2e-final.log`.
