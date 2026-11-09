# Bullet spacing core: TDD evidence

Implemented with the requested TDD skill. Final controls are independent:

- `bulletLineSpacing`: finite 1–3, default 1.
- `bulletSpacing`: finite 0–40px, default 8px.

The global prose line spacing remains separate. Existing paragraph spacing applies
between consecutive paragraphs within one item. Equations, code, and headings
retain their existing typography and margins.

## Default list layout and corrected requirement

The initial contract specified a 0px default gap. Added a test for tight, loose,
ordered, task, and nested lists, plus paragraphs outside lists. Ran
`node --import tsx tests/markdown.test.ts`: the new test failed because list items
had no explicit zero padding. Added trusted list padding/margin resets, removed
the trailing gap from direct list-item paragraphs, and reset nested list margins.
The same command passed all 18 tests.

Added the custom-gap test and executed it before implementation: the requested
12px peer gaps were still 0px. The user then corrected the contract to an 8px
default gap and a separate line-spacing control for bullets. Revised the tests to
that explicit requirement and re-established RED before the new production work:
default gaps were 0 instead of 8, custom gaps were 0 instead of 12, and bullet text
still inherited the global line spacing. An additional regression covered loose
paragraphs inside a nested blockquote and independent range validation.

Added both render options and validated their ranges. List items use zero padding
and bottom margin, with the selected top gap only on subsequent sibling items.
Nested lists use the selected top gap and zero bottom margin. A traversal context
applies bullet line spacing to list items and their paragraphs, including nested
blocks, while ordinary prose/table cells retain global line spacing. Direct
list-item paragraphs keep the paragraph after-gap only before another consecutive
paragraph. All 20 renderer tests passed.

Coverage includes 0, 8, 12, 12.5, and 40px gaps; invalid and non-finite fallbacks;
bullet line-height 1, 1.25, 2, and 3; global line-height 1.65 versus bullet 2; and
multiple paragraphs within an item. Generic shared-spacing tests now explicitly
set both line-spacing controls equally when testing their common behavior.

## Portable copy defaults

Added a real Chromium DOM test for unstyled list items. Ran
`node --import tsx tests/clipboard.e2e.ts`: the new test failed because the old
copy defaults added `3pt 0` margins and omitted the zero padding reset. Changed the
fallback list-item defaults to zero padding/margins. Existing trusted renderer
styles retain the actual selected peer gaps. All 16 Chromium tests passed.

## Full and partial copying

Added an integrated renderer plus Chromium regression for default 1/8 and custom
2/12 bullet settings, with global prose line-height 1.65 and paragraph gap 24px.
The fixture covers a loose ordered list starting at 3, multiple paragraphs,
nested bullets, tasks, and an ordinary paragraph. It copies the full document and
items 4–5 as a selection, verifying list numbering, exact style values, paragraph
gaps, task symbols, and an unchanged preview DOM.

Executed the Chromium command before production changes: the selected first item
retained an unwanted 8px leading gap, yielding `[8px, 8px]` instead of `[0px, 8px]`.
Normalized the first selected sibling item to zero top margin after trusted styles
are restored. Remaining peer and nested-list gaps retain the chosen setting. The
same command passed all 17 Chromium tests.

Focused TypeScript and ESLint checks pass for the shared types, renderer,
clipboard formatter, and corresponding tests.

These headless DOM tests do not access the operating system clipboard. UI,
preferences, native Writer paste/reopen, PDF, build, and packaging verification
are handled separately. No build, GUI, native clipboard, or output changes were
performed by this core slice.

## Confirmed Writer loose-list and nested-entry correction

The native Writer acceptance run later passed 6/7 tests and established a concrete
RED: the reopened document retained tight-item 8px gaps but a loose item's first
paragraph overrode its LI margin, producing a 0px peer gap. The saved native report
also showed a 0px parent-to-first-child gap because Writer ignored the nested list
container's top margin. A separate assertion against that actual reopened report
confirmed the nested-entry RED without another clipboard write.

Added a Chromium regression for the portable representation Writer supports,
alongside real browser geometry checks. Before production changes,
`node --import tsx tests/clipboard.e2e.ts` passed 17 tests and failed the new test:
the loose item's LI carried 8px while its first paragraph carried 0px, contrary to
the required paragraph-carried spacing. Browser peer/entry gaps were already 8px
and the within-item paragraph gap was already 24px, confirming this was a paste
transport issue rather than a preview-layout issue.

Added final clone-only transport passes after trusted styles and partial-leading
gap normalization. A nested UL/OL transfers its entry gap to its first LI and
resets the container top margin. An LI beginning with a direct paragraph transfers
its gap to that paragraph and resets the LI top margin. Existing paragraph bottom
gaps, line heights, and tight-list peer gaps are retained. The original preview
and PDF renderer are untouched.

The same Chromium command passed all 18 tests. Both full and partial ordered-list
tests now also measure actual nested-entry/peer browser gaps at 8px and 12px,
preserve numbering and the selection's zero leading outer gap, and confirm the
preview DOM is unchanged. Focused TypeScript and ESLint checks passed. Native
Writer verification of the new transport follows separately; Chromium GREEN is
not represented as native Writer acceptance.
