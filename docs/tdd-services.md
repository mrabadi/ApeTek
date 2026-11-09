# Desktop services TDD evidence

The focused integration command was `node --import tsx tests/services.e2e.ts`. Electron ran with an isolated temporary application profile. Native dialogs were replaced through Playwright's Electron main-process evaluation, so tests did not modify user documents or require interacting with native dialogs.

| Behavior | Observed RED before implementation | Observed GREEN |
| --- | --- | --- |
| Native Markdown Save/Open | `No handler registered for 'desktop:save'`. | Original Unicode, equation delimiters, code and newlines roundtrip unchanged; cancelled dialogs do not overwrite documents; existing paths save directly; Save as requests a dialog. |
| Recovery lifecycle | `No handler registered for 'desktop:loadRecovery'`. | Drafts persist within the isolated profile; corrupt recovery returns null; repeated discard succeeds. |
| Image IPC | `No handler registered for 'desktop:readImage'`. | Relative PNG sources become self-contained data URLs; unsafe and remote sources return null. |
| PDF export | `No handler registered for 'desktop:exportPdf'`. | A real paginated PDF contains an embedded PNG and selectable prose, verified with `pdftotext` through Paragraph 100. Cancellation returns null. |
| Unsaved-change confirmation | `No handler registered for 'desktop:confirmDiscard'`. | Native Save/Discard/Cancel responses map to the three bridge outcomes. |
| Native title and close guard | Native title remained `Markdown Local` instead of identifying the dirty document. | Editing marks the document dirty, native close routes through the document guard, Cancel keeps it open, and explicit close exits the app including hidden windows. |
| File menu | All six expected native menu commands were absent. | New/Open/Save/Save as/Export PDF/Close have Linux accelerators; clicking native Save emits the document action. |
| Recovery ordering regression | Concurrent `persistRecovery` of a 4 MB draft followed by `discardRecovery` left the old draft present after both promises resolved. The concise assertion failed `false !== true`. | A shared promise queue serializes reads, writes and discard; the regression passes. |
| Extensionless Save | Returned `/tmp/.../new-notes` instead of `/tmp/.../new-notes.md`. | Save appends `.md` and writes the expected Markdown file. |
| Command-line startup | Editor still displayed the sample document instead of the supplied Markdown file. | First `.md`/`.markdown` command-line path opens as a clean saved document. Startup handoff is consumed once. |
| Recovery priority | Editor displayed the command-line document instead of the unsaved recovered draft. | Dirty recovery wins over command-line startup, retaining the draft and leaving the requested file untouched. |
| Clean native close regression | After saving and native close, `assert.rejects(readFile(recovery.json), {code:'ENOENT'})` failed with `Missing expected rejection`: stale dirty recovery remained. | All native closes route through UI cleanup; the renderer awaits ordered recovery discard before explicit quit. The saved Markdown remains correct and recovery.json is absent after close. |

Binary PDF persistence extended the existing atomic-save public type from `string` to `string | Uint8Array`. Its focused TypeScript test first failed with `TS2345: Buffer is not assignable to string`; after the type correction, TypeScript and a byte-exact binary persistence test passed. The underlying filesystem writer already accepted binary buffers, so no runtime conversion was introduced.

Final feature integration result: **12 tests passed, 0 failed**, including all handlers through trusted IPC wrappers. The file/preload suite passes **8 tests**, including binary PDF bytes; the scroll suite passes **8 tests**. A stale-build attempt to wait for newer renderer markup timed out during close-test setup; it was not counted as RED. The app was rebuilt, and the intended title/dirty-state failure was re-established before implementation.

PDF export uses a dedicated hidden sandboxed window with data-only images, inline print styles, CSP blocking scripts and network subresources, fonts and image decoding readiness, A4/Letter paper, 0.6-inch margins, background printing and tagged output. The resulting buffer uses the same atomic replacement path as Markdown saves. Print windows close in `finally`, including failure cases. These tests prove pagination, selectable text and image inclusion; detailed visual clipping checks remain part of application-level PDF verification.

Integration is `registerServices(window)` before loading the editor page. Startup CLI uses the existing recovery bridge, avoiding another public bridge API. The test helper accepts optional `extraArgs` and `userData` for deterministic startup/recovery scenarios while preserving existing callers.

Native close before the first trusted document-state update is queued until the renderer is ready. The final quit flag allows the renderer's explicit close to exit all windows. `setDocumentState` also checks the target window is alive before updating its title. Privileged handlers use `trustedHandle`/`trustedOn`, with sender validation tested by the separately owned security suite.

Final whole-project TypeScript and targeted ESLint checks passed. Native test cleanup uses the shared forced-exit helper; its test-only exception hook records any main-process exception and exits instead of displaying a modal error dialog.

The final complete Electron suite passed **42/42 cases, 0 failed, 0 skipped** in 49.57 s, including all twelve desktop service scenarios after the final scroll correction.
