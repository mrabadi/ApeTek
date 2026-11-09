# Navigation and IPC security verification

The editor's preload exposes local file, recovery, rendering, clipboard, and export operations. Document links must leave those privileges in the packaged editor rather than navigate that privileged window to external content.

## Verified RED → GREEN cycles

1. **External navigation:** `node --import tsx --test-name-pattern='Markdown web link' tests/security.e2e.ts` initially failed because the editor URL became `https://markdown-local.invalid/documentation`. After the navigation guard, the same regression retains the packaged URL and original Markdown while the stubbed external opener receives the destination.
2. **Untrusted invocation:** the same-preload data-URL renderer test initially received a successfully rendered PNG (`allowed: true`). `trustedHandle` now rejects it with `Untrusted IPC sender` before dispatching to the feature listener. The same test passes.
3. **Popup creation:** the `window.open` regression initially observed additional Electron windows. The window-open handler now rejects child creation and routes approved external links to the external opener. The fixture waits for initial preview rendering so the app's own raster worker does not affect its before/after window comparison.

The final desktop command was:

```sh
node --import tsx tests/security.e2e.ts
```

Result: **7 tests passed**, covering external navigation, another renderer using the same preload, popup blocking, the HTTP/HTTPS/mailto allowlist, same-page anchors with legitimate IPC, an editor frame at the wrong URL, and ignored untrusted send messages. Fixtures fulfill external pages locally, and stub `shell.openExternal`; no browser or mail application is launched by the tests.

## Implementation boundary

`guardEditorWindow(window, expectedIndexUrl)` records the authoritative packaged file URL, prevents user navigation away from the editor, denies subframe navigation and child windows, and opens only HTTP, HTTPS, and mailto links externally. Ordinary same-document fragment navigation continues to work.

`trustedHandle(window, channel, listener)` and `trustedOn(window, channel, listener)` preserve Electron listener types. They require the registered editor's WebContents, its exact main frame, and the expected file URL. Fragment differences are allowed; another document URL is rejected. Invoke calls reject explicitly, while untrusted send messages are ignored. Destroyed frames and windows are rejected safely.

All privileged handlers in the main entry point and desktop services use these wrappers. The offscreen raster and PDF windows have no preload bridge and independently deny child windows.

The test helper explicitly selects XWayland and preloads a test-only uncaught-error logger. An uncaught main-process exception or rejection fails the test and writes diagnostics instead of opening Electron's modal exception dialog.
