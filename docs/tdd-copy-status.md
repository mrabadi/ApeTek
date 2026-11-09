# ApeTek 1.3.2: copy confirmation after an edit

The footer retained the last successful copy message. While typing, rendering
temporarily hid it; completing the render displayed "Copied rendered document"
again. Rendering itself did not write the clipboard, but the feedback implied
that it did. The same problem affected selected-passage confirmations.

## RED: completed copy feedback

Added `tests/status.e2e.ts` with a real Electron editor and an intercepted
`desktop:copyRendered` IPC handler. It counts explicit requests without accessing
the system clipboard. After a successful whole-document copy, typing one
character and awaiting the completed preview must show `Ready` and retain the
same copy count. The test also covers preview-selection copy, appearance changes
and preservation of the unrelated `Saved Markdown` message after saving.

Executed against the existing 1.3.1 build:

```sh
node --import tsx --test --test-concurrency=1 tests/status.e2e.ts
```

`test-results/copy-status-red.log` records the intended failure: actual
`Copied rendered document`, expected `Ready`. No production status handling had
been changed. Clearing only completed copy confirmations when rendering starts
made this first test pass; `copy-status-green.log` records 1/1 passing.

## RED: delayed copy feedback

Added a second regression with manually deferred IPC responses. It starts copy
A, edits the document, starts copy B, then resolves A while B remains pending.
A must not mark B completed. It also rejects an old response after an appearance
change and resolves a selected-passage copy after an edit.

```sh
node --import tsx --test --test-concurrency=1 \
  --test-name-pattern='late copy responses' tests/status.e2e.ts
```

`test-results/copy-status-race-red.log` records the intended failure: actual
copy-button state `copied`, expected `copying`. The pending promises do not call
any native clipboard API.

## GREEN and refactor

The renderer now invalidates copy feedback on source and appearance changes.
A small version ref ties asynchronous full and selected copy feedback to the
operation that started it. A newer edit or copy operation prevents an older
success or failure from changing the current footer or button state.

Only the two successful copy messages reset to `Ready`. Save, open, recovery and
other status messages keep their existing behavior. A stable callback shares
the invalidation logic without recreating the CodeMirror editor or introducing
additional copy calls. Current-revision copy payload generation is unchanged.

Rebuilt and executed the complete status regression file:

```sh
node --import tsx scripts/build.mjs
node --import tsx --test --test-concurrency=1 tests/status.e2e.ts
```

`test-results/copy-status-final-green.log`: **2/2 PASS**, no failures or skips.
Both success paths, stale success and failure paths, a newer pending operation,
explicit request counts and the saved-file status pass. A read-only review found
no additional issues. No unrelated production refactoring was needed.

## Verification scope

Unit tests, type checking, linting, related Electron UI regressions, production
build, real Linux package contents and a normal sandboxed packaged launch are
recorded in the delivered `verification/1.3.2/Test results.txt`.

The focused and related UI tests intercept every explicit copy request and do
not access the user's clipboard. The first packaged smoke attempted to load a
boundary using `--require` arguments, but the packaged launcher did not load
those test hooks. The boundary was not proven active before its explicit Copy
click; the test may have written the sample document to the clipboard. The
attempt stopped at the missing counter assertion. No clipboard read or attempted
restoration was performed.

The corrected packaged smoke performs no copy action and checks the normal
sandboxed launch, editing, defaults, layout and clean exit. Packaged renderer
bytes are compared with the build that passed the intercepted Electron tests.
Its results are reported separately; the failed setup attempt is not treated as
a product regression or a successful isolated check. Native Writer acceptance
was last run for 1.3.1 and was not rerun for this feedback-only fix. A full native
clipboard or full Electron suite result is not claimed for 1.3.2.

Commands used the local Node.js 24 runtime. Electron checks ran through the host
graphical session because the workspace sandbox cannot launch the GUI.
