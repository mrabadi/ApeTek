# Renderer TDD evidence

The renderer boundary is `renderMarkdown(source, { renderAsset, resolveImage? })`, returning semantic HTML and readable plain text. The raster callback is mocked in these tests because actual equation and diagram rasterization is a separate desktop boundary. Tests exercise real Markdown parsing, sanitization, source positions, and Prism tokenization.

## Executed RED → GREEN cycles

Each test was written and executed before the production change for that behavior. The focused command was `node --import tsx tests/markdown.test.ts` after the initial cycle. The initial command was `node --import tsx --test tests/markdown.test.ts`.

| Behavior | Observed RED | Observed GREEN |
| --- | --- | --- |
| Inline and display math as portable PNGs | New public renderer module did not exist (`ERR_MODULE_NOT_FOUND` for `src/core/markdown.js`); tsx was installed and functioning. | 1/1 test passed after adding the renderer. |
| GitHub tables, tasks, strikeout, emoji, readable table text | `Notes :sparkles:` remained literal, strikeout/tasks were plain text, and the table was a paragraph. | 2/2 tests passed after GFM/emoji parsing and plain-text table/task handling. |
| Sanitized raw HTML | Safe `<em>Raw HTML</em>` was absent because raw HTML was dropped. | 3/3 tests passed after raw-HTML parsing and sanitization; scripts, events, raw CSS, and unsafe links were absent. |
| Mermaid images with literal ordinary code | The asset-request list was empty for a Mermaid fence. | 4/4 tests passed after the custom Mermaid handler; dollar signs in code and escaped currency stayed literal. |
| Invalid equation/diagram isolation | A rejected raster callback rejected the entire document with `Invalid asset`. | 5/5 tests passed after visible source/error fallback; valid content and another equation still rendered. |
| Portable syntax highlighting | Fenced Python/JavaScript had no token spans or inline token colors. | 6/6 tests passed after Prism tokenization. |
| Source line scroll anchors | Rendered headings, paragraphs, equations, code, and list items had no `data-line` or `data-end-line`. | 7/7 tests passed after adding source-position attributes following sanitization. |
| Embedded document images and missing-image fallback | The image-resolver callback was never called; source URLs remained unresolved. | 8/8 tests passed after embedding resolved/inline image data and generating visible missing-image placeholders. |
| Valid raster-output contract | A remote HTTPS equation image was accepted into output. | 9/9 tests passed after requiring PNG data, finite positive dimensions, and a finite nonnegative descent. |

The Mermaid test's ordinary-code assertion was changed from an exact unhighlighted HTML substring to the language class plus the same literal plain-text code before adding the highlighting RED test. The table assertion was similarly made tolerant of additional attributes before adding source anchors. These changes preserve the user-visible contract while allowing the newly requested token spans and anchors.

## Refactor and verification

- Generalized the initial math handler into one asset handler when Mermaid was added, retaining the math assertions.
- A strict focused TypeScript check found an unnecessary third argument to the default code handler. Removed it and reran the focused tests.
- Final focused test command: `node --import tsx tests/markdown.test.ts` — **13 passed, 0 failed**, including the follow-up cycles below.
- Final strict type command: `node_modules/.bin/tsc --noEmit --module ESNext --moduleResolution Bundler --target ES2022 --lib ES2023,DOM --strict --esModuleInterop --skipLibCheck src/core/markdown.ts tests/markdown.test.ts` — **exit 0**.
- Browser-bundle smoke command: `node_modules/.bin/esbuild src/core/markdown.ts --bundle --platform=browser --format=esm --outfile=/tmp/markdown-renderer-smoke.js` — **exit 0**, bundle produced successfully (1.2 MB).
- The project-wide build, lint, native rasterization, and Writer clipboard integration are verified by the owning application workstream; this log does not claim those checks.

## Boundaries

- Math and Mermaid source reaches the rasterizer unchanged and becomes self-contained PNG image elements with explicit dimensions; inline math retains its baseline descent.
- Input HTML is sanitized before trusted Prism styles, raster styles, and source anchors are added. Document image data is limited to PNG/JPEG/GIF/WebP.
- Prism includes its default markup/CSS/JavaScript grammars plus Python, TypeScript, JSX/TSX, Bash, JSON, C/C++, Java, Rust, SQL, YAML, Markdown, Go, Ruby, and diff. Unknown languages remain escaped code.
- Full KaTeX command coverage and actual Linux clipboard acceptance require the real rasterizer and destination editor, rather than a fake proof in these unit tests.

## Follow-up acceptance and review cycles

Each follow-up used the same focused test command and an executed failure before production changes.

| Behavior | Observed RED | Observed GREEN |
| --- | --- | --- |
| Separate inline copy-image metadata | No `data-copy-src` was present (`0 !== 1`). | 10/10 passed after trusted inline-only metadata was added following sanitization; tight preview source and dimensions stayed unchanged for inline/display/diagrams. |
| File-URL image embedding | The local resolver received no request because sanitization removed the source early. | 11/11 passed after allowing file sources through the intermediate sanitizer; every image is still embedded or replaced before HTML leaves the renderer, including when no resolver exists. |
| Footnote, backreference and raw fragment links | Three fragment targets had no matching sanitized IDs. | 12/12 passed after fragment links were mapped to existing sanitized IDs, retaining the default clobber prefix. |
| Heading slugs and internal links | Generated headings had no IDs; the expected safe `user-content-a-title` ID was absent. | 13/13 passed after unique Unicode-aware heading slugs and local-link rewriting were added; explicit sanitized IDs and clobber protections remain intact. |

The source-anchor test was made tolerant of additional heading attributes before the heading-slug RED test, retaining its exact line-range assertions. Final focused TypeScript and ESLint checks on both core modules and their tests returned **exit 0**.
