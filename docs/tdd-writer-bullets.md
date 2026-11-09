# Writer list spacing acceptance

The 1.3.1 list controls use independent bullet line spacing (default 1, range 1–3) and a between-item gap (default 8px, range 0–40px). Ordinary paragraph spacing and line spacing remain separate. The acceptance fixture includes tight, loose, nested, ordered and task lists, plus editable prose with embedded equation PNGs.

## Inspector RED → GREEN

The existing synthetic ODT inspector test gained nested lists with two direct paragraphs in an outer item and an inherited paragraph style. Before the inspector change, it failed because `listParagraphs` was absent. The minimal inspector now reports each list paragraph's inherited line height and margins, nesting depth and direct paragraph index. The same focused test passes.

```sh
node --import tsx --test --test-name-pattern='Writer inspection reports' tests/writer.integration.ts
```

Evidence: `test-results/writer-list-inspector-red.log` and `writer-list-inspector-green.log`.

## Actual Writer RED

Before rebuilding the application with the new list styles or controls, the native acceptance test copied its fixture, pasted into a separate disposable Writer process, saved the ODT, closed and reopened it, and exported its PDF. The assertion failed on the tight-list gap: expected 8px, observed 4.0032px from Writer's paragraph margins. The inherited 100% line-height assertions already passed. This establishes the real clipboard/document behavior that must change, beyond testing for a missing settings control.

```sh
WRITER_OUTPUT_DIR=test-results/writer-bullets-red node --import tsx --test --test-name-pattern='independent bullet' tests/writer.integration.ts
```

Evidence: `test-results/writer-bullets-red.log` and `writer-bullets-red/bullet-default/`. The test clipboard guard reported `restored`; the prior clipboard remained only in Electron main-process memory.

## Integration RED → GREEN

The first combined final run passed the six existing Writer cases. The new case confirmed tight-item default gaps of 8px, then exposed a separate import issue: Writer let a loose item's explicit paragraph margin override its enclosing list-item margin, resulting in a 0px peer gap. This is an integration RED requiring a clipboard HTML correction; browser-only layout and clipboard DOM tests had passed. Evidence is retained in `test-results/writer-bullets-loose-red.log` and `writer-bullets-loose-red/`. The clipboard guard again reported `restored`.

The same saved ODT also showed 0px between a parent item and its first nested item: Writer had discarded the nested list wrapper's 8px top margin. An additional native acceptance assertion was executed against that existing reopened-document report and failed with expected 8px, observed 0px. This required no further clipboard write. Evidence: `test-results/writer-bullets-nested-red.log`. The final test covers that transition as well as sibling gaps.

The clipboard formatter now transfers these gaps onto the elements Writer imports: a loose item's first direct paragraph receives its item gap, and a nested list's first item receives its wrapper gap. The enclosing transported margin is cleared so the browser does not double the spacing. Preview markup, the original source and paragraph gaps inside loose items are unchanged. Headless browser tests separately check the physical gaps and partial-selection leading-margin behavior.

The unchanged native assertions passed in the focused Writer case (1/1, 13.05 seconds), then the complete Writer suite passed (7/7, no skips, 35.34 seconds). Both processes exited normally and both clipboard guards reported `restored`. The custom phase uses ordinary line spacing 1.65, independent bullet line spacing 2 and a 12px gap. Tight, loose, nested-entry, nested-peer, numbered and task-list gaps survive actual save/reopen, while the ordinary prose retains its separate 165% line height.

Evidence: `test-results/writer-bullets-green.log`, `apetek-1.3.1-writer-final.log`, and `apetek-1.3.1-writer/bullet-default/` / `bullet-custom/`. Each proof directory contains the actual ODT, a PDF exported from the reopened Writer component, its report and rendered page PNGs. Visual review confirmed the wrapped-item line spacing and the requested default/custom gaps. The custom fixture naturally occupies two pages.

The target-only harness initially attempted to reload preferences before Electron's initial document load finished, producing a captured `ERR_ABORTED` before any clipboard write. It now waits for the packaged renderer URL, completed load and editable CodeMirror content before returning the page. This was test setup, separate from both genuine native spacing failures.

## Known limits observed during visual review

Two pre-existing Writer 7.3 rendering differences remain outside this spacing correction. Nested list structure is retained as depth 2 in the ODT, but Writer's pasted visual indentation is flattened to the outer level. Checked task text (`☑`) also remains editable in the saved ODT, but its glyph appears blank in Writer's exported PDF on this Ubuntu installation; the unchecked square is visible. The native tests establish editable list semantics, independent line spacing and the requested gaps, rather than complete visual parity for those two cases. These differences were present before the gap transport correction.
