# LibreOffice Writer clipboard acceptance

The required destination is LibreOffice Writer on Ubuntu 22.04. The automated test uses the real Linux clipboard and a new Writer process with a disposable profile. It never selects an existing Writer document, reuses the normal LibreOffice profile, or terminates another LibreOffice process.

## Run the test

Run from the project directory in the graphical desktop session. Dependencies are `/usr/bin/libreoffice`, `/usr/bin/python3`, and `python3-uno`, in addition to the project's installed development dependencies.

```sh
npm run build
npm run test:writer
```

The test enters a fixture into the app, clicks **Copy rendered**, confirms that HTML contains embedded PNG equations, and dispatches Writer's ordinary Paste command against its new document. A disposable Writer window is shown so it can use the native session clipboard. Tests using the clipboard must run sequentially. Electron uses XWayland for reliable desktop clipboard ownership in this GNOME Wayland session; native Wayland can require an input serial that a hidden automated window does not have.

The test guard captures the prior clipboard immediately before its first explicit copy and holds it only in Electron main-process memory. At teardown it restores those entries only if the clipboard still matches the native representation of the test's last copy; a newer user copy is left alone. No-copy tests do not read the clipboard. Logs report restoration status without clipboard contents.

The fixture includes a heading, editable prose, bold and italic text, a link, two list types, a table, fenced code containing literal dollar signs, inline equations, and a display equation. Assertions inspect the saved ODT for editable text, actual heading/list/table structures, embedded PNG files, and equation frames anchored as characters. A negative test ensures that an image-only document cannot pass this gate.

The harness closes each saved document and reopens its ODT in the disposable Writer process. It compares the actual reopened component's editable text, graphic-object count, and table count with the original paste. The PDF is exported from that reopened component. The report's `roundTrip` values record this comparison.

A separate preference case pastes the same note with default left-aligned display equations at 100%, single line spacing, and a 13-pixel paragraph gap. It then selects centered equations at 150%, line spacing 2, and a 24-pixel gap. It checks inherited paragraph alignment, line height and margins, inline baseline properties, the chosen preview dimensions, three-times PNG pixel density, and Writer's physical frame sizes. Its artifacts are kept separately in `math-left-100/` and `math-center-150/` below the output directory. Version 1.3's 100% math uses the previous version's 75% physical size.

The list preference case covers tight and loose bullets, nested lists, numbered lists and task lists. It checks the default bullet line spacing of 1 and eight-pixel gaps, then chooses bullet line spacing 2 and twelve-pixel gaps while ordinary paragraphs use line spacing 1.65. The saved and reopened ODT must retain those independent choices. `listParagraphs` records inherited line height, top and bottom margins, nesting depth and direct paragraph position. The separate proof directories are `bullet-default/` and `bullet-custom/`.

Results remain in `test-results/writer/`:

- `writer-paste.odt`: the actual pasted document, with embedded equation images.
- `writer-paste.pdf`: Writer's PDF export for visual inspection.
- `writer-report.json`: semantic counts, editable text, image references, pixel and physical dimensions, paragraph alignment, inherited line height and margins, baseline properties, and the save/reopen comparison.
- `writer-process.log`: startup diagnostics from the disposable Writer process.

Set `WRITER_OUTPUT_DIR=/absolute/path` to retain these artifacts somewhere else. Temporary app and LibreOffice profiles are removed after the test.

## Paste the current clipboard directly

After copying a preview from the application, this command pastes the current clipboard into a separate Writer document and leaves the same artifacts in the requested directory:

```sh
/usr/bin/python3 scripts/writer-paste.py --output-dir test-results/writer-manual
```

To recheck an existing artifact without opening Writer:

```sh
/usr/bin/python3 scripts/writer-paste.py --inspect-odt test-results/writer/writer-paste.odt
```

The direct inspector checks for editable paragraph text and embedded PNG graphics. The full Node acceptance test adds the fixture-specific heading, list, table, code, and image-count assertions.

## Visual acceptance

Open the saved ODT and PDF. Confirm that inline equations sit naturally within their sentences, display equations are complete, table cells and lists retain their structure, and code uses a monospace face. Edit the surrounding prose in Writer, then save and reopen the ODT to confirm its equations remain embedded. Also select a mixed passage directly in the app preview, press Ctrl+C, and paste it into a new Writer document.

HTML and plain text are the offered clipboard representations. Equations use self-contained PNG data URLs; no local asset files or running image server are required. The app deliberately omits a full-document PNG clipboard representation so ordinary Paste retains editable prose. Other rich editors may apply their own HTML/image rules and are outside the Writer acceptance contract.

Two observed Writer 7.3 visual differences remain: nested lists retain their editable hierarchy in the ODT but their pasted indentation is flattened, and checked task text (`☑`) survives in the document while its glyph appears blank in Writer's PDF export on this Ubuntu installation. The unchecked square is visible. The spacing tests verify the list line heights and gaps without asserting perfect visual parity for those cases.

A headless HTML import is useful for parser checks but does not establish that the real GNOME clipboard works. Run this acceptance test in the actual desktop session; if the session restricts background clipboard access, focus the disposable Writer window and repeat the manual paste check.
