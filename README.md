# ApeTek

A local Markdown editor for Ubuntu 22.04 x86_64: write on the left, preview on the right, and copy editable rich text with equations rendered as individual PNG images.

The app includes GitHub-style Markdown, tables, task lists, syntax-highlighted code, Mermaid diagrams, inline `$…$` and display `$$…$$` math, source-aware synchronized scrolling, Markdown saving, recovery drafts, and PDF export. Rendering runs offline with bundled dependencies. No TeX installation, account, or server is needed.

PDF export defaults to Letter. **Document settings** offers left or centered display equations, a LaTeX size slider from 50% to 200% in one-percent steps, prose line spacing from 1 to 3, and paragraph spacing from 0 to 40 pixels. Separate **Bullet line spacing** and **Between bullets** sliders control list lines and the extra gap between items. Fresh preferences use 100% math, single prose and bullet line spacing, 13-pixel paragraph gaps, and 8-pixel gaps between bullets. These settings apply to preview, rich copying, and PDF export.

The 100% math size now equals 75% in version 1.2. Saved size choices migrate to preserve their appearance within the new range.

## Install and run

For the Ubuntu package, run from the directory containing the download:

```sh
sudo apt install ./apetek_1.3.3_amd64.deb
apetek
```

You can also launch **ApeTek** from the applications menu. Normal startup reopens your last saved or opened Markdown file; a fresh profile starts with a blank document. Unsaved recovery drafts take priority. Passing a Markdown filename opens that file instead of the remembered file when there is no recovery draft.

Installing this package replaces the earlier Markdown Local package. Your Markdown files and recovery drafts are retained.

For the portable archive:

```sh
tar -xzf apetek-1.3.3-linux-x64.tar.gz
cd apetek-1.3.3-linux-x64
./apetek
```

Keep the extracted directory together. Both packages include Electron and its Node.js 24 runtime; users do not need a separate Node.js installation. The `.deb` installs the Linux sandbox helper with its required permissions.

## Copy into Writer

Use **Copy rendered** for the complete document. To copy part of the preview, select it and press **Ctrl+C**, then paste into LibreOffice Writer with **Ctrl+V**. Prose stays editable, tables retain their structure, and equations and diagrams are embedded PNGs. Other rich editors apply their own paste rules, so their formatting support is best effort.

Rich copying uses the standard Linux clipboard. Middle-click/PRIMARY selection does not provide the formatted copy payload.

Rendered content is copied only by **Copy rendered** or **Ctrl+C** with a preview selection. Editing, scrolling, and changing settings do not copy automatically.

[Usage and keyboard shortcuts](docs/USAGE.md) · [Writer acceptance procedure](docs/WRITER-TEST.md)

## Build from source

Use Node.js **22.12 or newer**; Node.js 24 is recommended. Run these commands from the project directory:

```sh
npm ci
npx install-electron --no
npm run build
npm start
```

Dependency installation needs internet access. Electron 45 uses an explicit runtime installer; the `install-electron` command above comes from the installed Electron package. The built application runs offline.

Create the Ubuntu package and portable archive on Linux x86_64 with `dpkg-deb` and `tar` available:

```sh
npm run build
npm run package:linux
```

Packages are written to `release/`.

## Development checks

```sh
npm test
npm run typecheck
npm run lint
npx playwright install chromium
npm run test:e2e
npm run test:writer
```

Run desktop and Writer tests sequentially in an active graphical desktop session. The Writer test needs LibreOffice, Python 3, and `python3-uno`; it uses a disposable Writer profile and document. Detailed test evidence lives in `docs/tdd-*.md`.

## Formats and limits

- Save writes UTF-8 `.md` source without generating equation image sidecars. Recovery drafts live separately in the app's per-user configuration directory.
- Local paths, `file:` URLs, and embedded data images support PNG, JPEG, GIF, and WebP. Relative images resolve beside the saved Markdown file. Remote image URLs currently display a placeholder.
- Math follows the bundled KaTeX subset of LaTeX math, including fractions, matrices, aligned equations, and cases. Full TeX documents and arbitrary TeX packages are outside that subset.
- Export produces PDF. Word/DOCX file export is not included; use rich copy to paste into Writer.

The project is released under the [MIT license](LICENSE). Bundled third-party dependencies retain their respective licenses.
