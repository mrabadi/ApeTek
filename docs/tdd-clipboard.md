# Clipboard formatter TDD evidence

`clipboardPayload(root: HTMLElement, range?: Range)` returns `{ html, text }` without writing to the OS clipboard. It is self-contained: tests pass the actual exported function directly into Playwright's real Chromium DOM, and selection tests serialize the same function into that DOM before constructing browser-native Ranges.

## Executed RED → GREEN cycles

The focused command was `node --import tsx tests/clipboard.e2e.ts`. Each new test was executed before its production change.

| Behavior | Observed RED | Observed GREEN |
| --- | --- | --- |
| Full rich copy with editable prose, formula images and baseline metrics | The deliberately new public `src/core/clipboard.js` module was missing (`ERR_MODULE_NOT_FOUND`). | 1/1 passed after implementation. |
| Partial heading selection | The entire preview, including unselected before/after paragraphs, was copied instead of `Heading`. | 2/2 passed after `cloneContents()` and ancestor-wrapper restoration. |
| Partial table cells and equation images | Plain text joined selected cells as `alphaBeta E=x` instead of `alpha\tBeta E=x`. | 3/3 passed after cell separators and inline table/cell styles; selected table structure and PNG remained intact. |
| Partial numbered/nested task lists | Plain text was `donenested`, losing the checkbox and nested-list separation. | 4/4 passed after Unicode task symbols, restored list numbering, list styles and block separation. |
| Portable headings, code, quotations and links | The copied H2 had no inline 18pt heading style; code and quotations also lacked portable formatting. | 5/5 passed after inline typography; Prism token colors remained present. |
| Hidden source removal and self-contained images | Hidden source text, blob/file image references, srcset and application attributes remained in HTML. | 6/6 passed after hidden-node removal, attribute normalization and visible missing-image placeholders. |
| Range clipping and empty selections | A selection beginning before the preview included `before outside` in copied text. | 7/7 passed after clipping a cloned Range to the root; outside/collapsed ranges returned empty payloads. |
| Partial highlighted code and whitespace | Selected code became `return total`, losing four leading and two trailing spaces. | 8/8 passed after trimming only outer block newlines, preserving indentation and pre/code/token wrappers. |

The first attempt to launch Chromium inside the restricted command sandbox failed with `sandbox_host_linux.cc ... shutdown: Operation not permitted`. This was an environment failure during verification, not a claimed RED. The same test command then ran successfully with the approved escalated command environment. The tests use the installed Playwright Chromium build 1234, disposable pages and no network or OS clipboard writes.

## Final verification

- `node --import tsx tests/clipboard.e2e.ts` in the escalated command environment: **12 passed, 0 failed**, including the follow-up cycles below.
- `node_modules/.bin/tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --strict --esModuleInterop --skipLibCheck src/core/clipboard.ts tests/clipboard.e2e.ts`: **exit 0**.
- `node_modules/.bin/eslint src/core/clipboard.ts tests/clipboard.e2e.ts`: **exit 0**.

Type verification required narrowing the function's optional Range argument to its one-argument signature at direct Playwright evaluation call sites; no runtime behavior changed. Function independence is verified by execution in Chromium rather than merely inspecting its source.

These tests cover HTML/plain-text payload construction. Real Linux clipboard formats and paste acceptance in LibreOffice Writer are separate integration tests owned by the desktop workstream.

## Writer acceptance and semantic-link follow-up cycles

All four follow-ups used executed RED → GREEN cycles with the same real-Chromium command.

| Behavior | Observed RED | Observed GREEN |
| --- | --- | --- |
| Writer inline baseline support | Full/selected copies retained the tight source and 24px image height instead of the padded copy source and 40px height. | 9/9 passed after cloned inline images consumed copy metadata, updated CSS height/descent, added legacy `align="middle"`, and removed all `data-copy-*` attributes. The preview stayed tight. |
| Full-width tables | Copied tables lacked legacy `width="100%"` and full-width CSS. | 10/10 passed for full and selected-cell copying after both width forms were added. |
| Centered display math and diagrams | Block images remained children of ARTICLE, with `display:block`, auto margins, and no centered paragraph. | 11/11 passed after wrapping copied block assets in centered paragraphs and using inline-block/margin zero, while preserving their tight raster source/dimensions and leaving the preview untouched. |
| Semantic heading/footnote bookmarks | Copied fragment links retained zero of their three target IDs. | 12/12 passed after allowing only sanitizer-prefixed semantic IDs; the application root ID is still removed. |

The earlier baseline test's display-image assertion was updated before the centering RED test to verify its tight asset and dimensions rather than the superseded block CSS. The new centering test explicitly inspects parent paragraph alignment in Chromium. Final focused strict TypeScript and ESLint checks returned **exit 0**.
