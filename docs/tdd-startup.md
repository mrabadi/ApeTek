# ApeTek 1.3.3: reopen the last file, otherwise start blank

A new profile starts with empty Markdown and an empty preview. The bundled demo
was removed from editor initialization, source state and the saved-source baseline.
Startup priority is an unsaved recovery draft, an explicit command-line Markdown
file, the last accepted file, then a blank clean document. Files are read from
disk; the remembered entry stores only an absolute path in the existing profile.

## RED -> GREEN: blank startup

Added `tests/startup.e2e.ts` using a disposable profile and real Electron editor.
After startup finishes, both source and preview must be empty and clean.

```sh
node --import tsx --test --test-concurrency=1 tests/startup.e2e.ts
```

Before production edits, `startup-blank-red.log` failed with the complete built-in
demo as actual source versus the expected empty string. Removing that initial
document made the same test pass: `startup-blank-green.log`, **1/1 PASS**.

## RED -> GREEN: last accepted file

The next test opens a file through the native Open boundary, closes the app
normally, changes the file on disk, and relaunches with the same profile and no
file argument. It then saves under a new name and verifies the next launch uses
that path. The final version also checks reopening an empty saved file.

```sh
node --import tsx --test --test-concurrency=1 \
  --test-name-pattern='last accepted file' tests/startup.e2e.ts
```

`startup-last-file-red.log` failed with `Untitled.md` instead of the previously
opened path. A separate `last-document.json` now records accepted non-null paths
from the existing document-state bridge. Atomic writes run in order, and normal
shutdown awaits them. This does not depend on recovery content, which clean close
correctly discards. The two-test startup file then passed **2/2** in
`startup-last-file-green.log`.

Remembering the accepted UI state matters: a native Open can finish while the
user edits, then be rejected by the second unsaved-change guard. That rejected
file must not become the next startup file. New blank documents do not erase
the last real file. Save and Save As update it only after success.

## RED -> GREEN: safe fallback

Added `tests/session.test.ts` with temporary files and profile metadata.

```sh
node --import tsx --test tests/session.test.ts
```

`startup-fallback-red.log` failed with `ENOENT` for a deleted remembered file.
The loader now treats missing/unreadable files and invalid profile metadata as
no available document. `startup-fallback-green.log` passes **1/1**, including
corrupt JSON, invalid paths/schema, unsupported extensions, unreadable files
and a valid empty Markdown file. The sandbox-only Node subprocess attempt did
not report a meaningful failure; RED was established with host execution.

## Refactor and verification

No unrelated runtime refactor was needed. Existing atomic-file helpers are reused;
the typed IPC surface is unchanged. A popup security test now supplies its own
heading fixture instead of relying on the removed startup demo. Math, clipboard
payloads, document styling and the toolbar are unchanged.

The final startup tests additionally cover CLI override, dirty recovery priority,
deleted-file blank fallback, a cancelled Save As and a guarded Open rejected
after a newer edit. An initial test-only local arrow helper serialized with an
unavailable `__name` helper inside Electron evaluation. Inlining those two test
marker calls repaired the harness; that setup error is not counted as a product
RED. Its log is retained separately.

The full unit suite, startup/related Electron checks, TypeScript, ESLint, build,
real package payload comparisons and normal packaged restart results are recorded
in the delivered `verification/1.3.3/Test results.txt`. The package smoke performs
no copy actions, uses no injected `--require` hook, and proves fresh blank ->
explicit file -> normal no-argument restart using only a disposable file/profile.

Native Writer acceptance was not rerun for this startup-only change. Any related
copy-status regression uses intercepted IPC, without native clipboard access.
The related test filter did not exclude two existing native editor-copy tests;
both ran and passed. Their in-memory clipboard guard reported restoration after
each test. Original contents were not logged, serialized to disk or exposed to
the agent. This execution-scope mistake is recorded in the release report.
Commands use the supported local Node.js 24 runtime; GUI and subprocess tests
run on the host because of workspace sandbox restrictions.
