# Using ApeTek

Current release: **ApeTek 1.3.3**, distributed as `apetek_1.3.3_amd64.deb` or `apetek-1.3.3-linux-x64.tar.gz`.

## Write and preview

The single toolbar combines the ApeTek logo, **LATEX FOR APES** subtitle, file controls, copying, PDF export, and settings. Type Markdown in the left pane. The right pane renders headings, emphasis, links, lists, task lists, tables, code, math, and Mermaid diagrams. Scrolling follows matching source blocks between the two panes. Drag the divider to change their widths.

Inline math uses single dollar signs:

```markdown
Energy is $E = mc^2$.
```

Display math uses double dollar signs on their own lines:

```markdown
$$
x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}
$$
```

The app renders the KaTeX-supported LaTeX math subset. It needs no TeX installation. Code fences and inline code keep dollar signs literal. An invalid equation or diagram shows its source and an error while the rest of the document remains available.

## Equation layout and size

Display equation blocks align left by default. Open **Document settings** and choose **Display equation blocks → Center** to center each complete block. This positions the equation image; alignment within an `aligned` environment, matrix, or other TeX structure still follows its LaTeX source.

**LaTeX size** defaults to **100%**. Its slider accepts every integer from **50% to 200%** and changes both inline and display equations in the preview, copied PNGs, and PDF. The new 100% equals the old 75% size in version 1.2. Existing saved size choices migrate to retain their appearance, subject to the new range; for example, old 75% becomes 100%, and old 100% becomes 133%. Surrounding prose, code, and diagrams keep their sizes.

**Line spacing** ranges from **1 to 3**, with **1** as the default for ordinary prose. **Paragraph spacing** ranges from **0 to 40 pixels**, with **13** as the default gap after a prose paragraph.

List formatting has independent controls: **Bullet line spacing** ranges from **1 to 3** and defaults to **1**, including wrapped lines within an item. **Between bullets** ranges from **0 to 40 pixels** and defaults to an **8-pixel extra gap between items**. These settings also apply to ordered and task lists. Changing prose line spacing does not change bullet line spacing.

All of these settings apply to the preview, copied text, and PDF. Heading, code, and internal TeX typography retain their own formatting.

Press **Escape** to close the settings. These preferences are remembered on this computer and do not modify the Markdown source.

## Save, open, and recover

A fresh profile starts with a blank document. Later launches reopen the last Markdown file you saved or opened. An unsaved recovery draft takes priority. If there is no recovery draft, launching `apetek notes.md` opens that explicit file instead of the remembered file.

Use **New**, **Open**, **Save**, or **Save as** in the toolbar. Saving preserves Markdown source in a UTF-8 `.md` file. It does not create formula image sidecars. A changed document shows an unsaved indicator; opening another document, creating a new one, or closing offers Save, Discard, or Cancel when needed.

Unsaved drafts are recovered separately from the app's per-user configuration directory, under the normal Linux configuration location. Recovery does not replace a deliberate Markdown save.

To edit the saved source in a terminal editor:

```sh
vim notes.md
```

## Copy rendered content

Choose **Copy rendered** to copy the full rendered document, including any pending rendering work. For a passage, select it directly in the preview and press **Ctrl+C**. Paste normally into LibreOffice Writer with **Ctrl+V**.

Editing, scrolling, and changing settings never copy rendered content automatically. Only these explicit copy actions update the rich clipboard. The copy confirmation clears when you change the document.

Text remains editable. Headings, lists, tables, links, and code carry their formatting. Each rendered equation or diagram is an embedded PNG; formulas do not depend on a temporary image folder or a running server. Inline math has a separate copy layout for Writer's image alignment. The preview and PDF use the tight rendered images.

The app supplies HTML and readable plain text on the standard Linux clipboard. Plain-text destinations receive formula source text. Middle-click/PRIMARY selection is not the rich-copy workflow. Other editors may interpret pasted HTML and images differently; Writer is the tested destination.

## Export PDF

PDF paper size defaults to **Letter**. Choose **A4** if needed, then use **Export PDF** and select a destination. Your selected paper size is remembered. The PDF contains the rendered document, with the chosen equation layout and size, diagrams, code colors, and tables. It is separate from the editable `.md` source.

## Images

PNG, JPEG, GIF, and WebP work through local paths, `file:` URLs, or embedded `data:` images. For example:

```markdown
![Experiment](images/experiment.png)
```

Save the Markdown file before using relative image paths; this example resolves from the Markdown file's directory. Keep linked image files with the document when moving it. Remote image fetching is currently disabled; missing or unsupported images show a visible placeholder. Clipboard copying embeds resolved image data.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New document |
| Ctrl+O | Open Markdown |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save as |
| Ctrl+Shift+P | Export PDF |
| Ctrl+F | Find in the source editor |
| Ctrl+C | Copy the selected preview passage when the preview has a selection |
| Ctrl+Q / Ctrl+W | Close, with an unsaved-changes check |

All rendering dependencies are bundled. Normal editing, image rendering, saving, rich copying, and PDF export work offline.
