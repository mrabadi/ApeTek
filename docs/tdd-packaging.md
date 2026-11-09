# ApeTek Linux packaging

The rename must produce an ApeTek 1.1.0 portable archive and Debian package, install the `apetek` command and PNG desktop icon, and replace the earlier `markdown-local` package. The launcher must retain the verified X11 default and respect an explicit backend argument. Chromium's sandbox remains enabled.

`tests/packaging.test.ts` runs the production packaging script in a disposable project containing a miniature executable runtime. It creates real tar and Debian archives, reads their metadata and extracted files, and executes the resulting launcher. It does not install a package or change any user document or profile.

## RED

Before changing package metadata or the packaging script:

```sh
node --import tsx --test tests/packaging.test.ts
```

The test failed because the produced archive was `markdown-local-1.0.0-linux-x64.tar.gz`, while the required name was `apetek-1.1.0-linux-x64.tar.gz`. The command ran with host execution permission because restricted nested subprocess execution did not return usable test output; that environment failure was not counted as RED.

## GREEN

Updated the application identity and version, launcher and binary names, installation paths, desktop entry, PNG icon packaging, and Debian `Conflicts`/`Replaces` metadata. The same focused command then passed: one test, zero failures.

The assertions cover packaged application identity, both artifact names, the icon at the portable and application-resource paths, the desktop icon and command, the root-owned setuid sandbox helper, archive contents, and actual launcher arguments with the default and explicitly selected backends.

## Verification

The full TypeScript check and ESLint check passed after the changes. The broader unit suite also passed with 33 tests using the supported Node.js 24 runtime and host execution. The notices generator was rerun successfully with ApeTek labels: 249 dependency entries, none without notice text.

The miniature runtime test checks packaging behavior. The final real Electron package still receives a separate normal-sandbox launch check after the application build and icon are finalized.
