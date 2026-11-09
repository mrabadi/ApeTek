# ApeTek branding TDD evidence

The application now uses ApeTek in its header, HTML title, native application name, and document window titles. The header displays the supplied transparent geometric chimpanzee artwork; the native window receives the matching PNG icon copied into `dist/desktop` during the build.

Renaming the application preserves the existing `appData/Markdown Local` profile, including recovery drafts. `MARKDOWN_LOCAL_USER_DATA` remains the first-priority override. All tests use temporary profiles or a mocked Electron bootstrap; none reads or writes the user's real profile.

## RED

Before the production branding changes, ran:

```sh
node --import tsx --test tests/branding.e2e.ts > test-results/branding-red.log 2>&1
```

The new integration test failed on the visible header: expected `ApeTek`, received `Markdown Local`. The test also describes the loaded chimpanzee image, native name/window title, isolated test profile, and built PNG icon.

Before the profile-preservation implementation, ran:

```sh
node --import tsx tests/branding.test.ts > test-results/branding-profile-red.log 2>&1
```

The bootstrap contract failed because the default userData path was unset rather than the legacy `Markdown Local` profile beneath a temporary appData directory.

## GREEN

The same focused commands passed after the minimal changes:

- Electron branding: 1 passed, 0 failed (`test-results/branding-green.log`).
- Isolated default/override profile bootstrap: 1 passed, 0 failed (`test-results/branding-profile-green.log`).

The profile test evaluates the real bundled main module against mocked Electron startup APIs, so it verifies configuration without launching Electron or loading personal content. It checks that both the legacy path and explicit override are created before `setPath` is used.

## Verification

`npm run typecheck`, focused ESLint for all changed source/tests/build files, and `npm run build` passed. The integration test captures `test-results/apetek-branding.png`; visual inspection confirmed the natural transparent 48px chimpanzee shape is clear beside the wordmark and the editor layout remains intact.

The complete Electron suite passed **43/43 cases, 0 skipped, 0 failed**, in **49.29 seconds**, including all native title, startup, clipboard, PDF, and scroll checks. Raw output is recorded in `test-results/apetek-e2e-final.log`. The initial full renamed-app run exposed an existing intermittent CodeMirror pending-caret scroll conflict; its separately verified regression and minimal fix are documented in `docs/tdd-scroll.md`.

No behavior-preserving refactor was needed. The change retains the existing recovery directory and environment variable names for compatibility.
