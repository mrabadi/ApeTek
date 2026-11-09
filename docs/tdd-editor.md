# Editor and revision TDD evidence

Focused command: `node --import tsx tests/editor.e2e.ts`, with `--test-name-pattern` during individual cycles. Each test uses an isolated application profile.

| Behavior | Observed RED | GREEN / verification |
| --- | --- | --- |
| Editing and live rendering | Markdown source textbox did not exist; locator timed out. | CodeMirror editing produced semantic headings/tables, highlighted code, and two PNG equation images. |
| Copy rendered | Copy button did not exist; locator timed out. | Copy waits for the newest completed render, embeds PNGs, and excludes stale sample content and source attributes. |
| Save and cancel-safe Open | Save button did not exist. | Native-dialog flow saves exact Unicode source; cancelling unsaved settlement preserves edits; discard permits opening another document. |
| Selected rich copy | Browser default copy lacked `align="middle"` and leaked image copy/source metadata. | Preview Ctrl+C serializes only the selected passage through the controlled rich-copy pipeline. |
| Startup recovery | Delayed recovery left editor editable (`true !== false`). | Initial editor is read-only and file actions wait until recovery completes, preventing startup replacement races. |
| Source-linked scrolling | Preview remained at top when source moved to end. | Source-line anchors drive both panes and resize handling; subsequent reverse/layout regressions are recorded in tdd-scroll.md. |
| Document undo isolation | Ctrl+Z after Open restored the previous document into the new file. | Replacing a document resets the history compartment; undo no longer crosses document boundaries. |

PDF export has a verified backend RED/GREEN cycle in tdd-services.md. The UI PDF case verifies the latest rendering, Letter page dimensions, multipage output, and selectable prose through paragraph80. An early UI attempt failed during app setup and was not counted as a valid RED.

`node --import tsx tests/revisions.test.ts` initially failed for the deliberately missing revision-renderer public module; implementation passed the late-result ordering test. A further test failed with `obsolete failure` when an older render rejected while a newer render existed; ignoring superseded rejection passed both cases.

Tests preload capture-main-errors.cjs so main-process exceptions fail the test and are recorded in its isolated profile rather than opening modal dialogs on the desktop. This test-only preloader is not included in the packaged application runtime.
