# File service and preload TDD evidence

All work below used the required RED → GREEN workflow. The focused command was `node --import tsx tests/files.test.ts`, which executes Node's test runner and preserves individual test names in this environment. The package's `node --import tsx --test ...` wrapper also runs, but reports only the enclosing test file here.

An initial attempt could not resolve `tsx` while dependencies were installing. That environment failure was **not** counted as RED. Tests were rerun after installation.

| Behavior | Observed RED before implementation | Observed GREEN |
| --- | --- | --- |
| Desktop preload API | `node --import tsx --test --test-name-pattern='preload exposes' tests/files.test.ts`: esbuild could not resolve the new `src/desktop/preload.ts` entrypoint. | Real bundled preload exposed only `desktop`, routed all 10 invoke operations and both send operations correctly, and removed its action listener on unsubscribe. |
| Exact Markdown save | `node --import tsx tests/files.test.ts`: `ERR_MODULE_NOT_FOUND` for the deliberately new file-service module. | Original Unicode, math delimiters, code and newlines persisted byte-for-byte as UTF-8. |
| Failed-save protection | With a directly writing initial implementation, the readonly-directory scenario failed with `Missing expected rejection.` | Same-directory exclusive temporary file, file sync and rename rejected the replacement while preserving the previous file and leaving no temporary files. |
| Markdown loading | `readMarkdown is not a function`. | `.md`/`.markdown` loading preserves source; unsupported formats reject; missing-file errors propagate. |
| Recovery lifecycle | `loadRecovery is not a function`. | Save/load/discard roundtrip passes for named and unnamed drafts; absent, corrupt and schema-invalid JSON return null; repeated discard succeeds. |
| Local image portability | `resolveLocalImage is not a function`. | PNG sources resolve from document-relative paths, absolute paths, file URLs and data URLs into self-contained PNG data URLs; missing, remote, SVG and disguised SVG sources return null. |
| Other supported raster formats | `null` instead of the expected `data:image/jpeg;base64,...`. | JPEG, GIF and WebP signatures are recognized; mismatched declared MIME and unsafe URL schemes are rejected. |

Initial focused verification: **7 tests passed, 0 failed**. PDF integration later added a byte-exact binary save test; the final file/preload suite is **8 tests passed, 0 failed**. The public save content type now accepts `string | Uint8Array`; the preceding focused TypeScript check rejected Buffer with TS2345 before this type correction. Only extra blank lines were removed after the final GREEN; the same focused command was rerun with all seven tests passing. Targeted TypeScript checking of `files.ts`, `preload.ts`, and `files.test.ts` also passed.

Whole-project `npm run typecheck` was attempted after these changes. Its only diagnostic at that time was outside these owned files: `src/desktop/main.ts(8,89)` used the old Electron clipboard write shape. Root agent was informed. Targeted ESLint was attempted but the project had no ESLint configuration yet; this was reported as unavailable rather than passing.

The file service intentionally leaves remote fetching and SVG rasterization to the main application's image pipeline. It returns null for unsupported or unreadable image sources, so the renderer can preserve alt text. Filesystem failures during document saves and recovery writes propagate to the caller.
