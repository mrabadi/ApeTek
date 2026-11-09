# Independent bullet spacing TDD evidence

Document settings now contains independent **Bullet line spacing** (1–3, 0.05 steps, default 1) and **Between bullets** (0–40px, 1px steps, default 8px). The existing prose Line spacing remains independent. Both values use the existing validated v2 preferences, wheel support, debounced revision rendering, and preview/copy/PDF pipeline. Older v2 preferences acquire the defaults; v1 math-size migration remains unchanged.

## RED

Before production changes, the updated preferences suite failed because the loaded defaults lacked `bulletLineSpacing: 1` and `bulletSpacing: 8`. The focused Electron acceptance test failed because the **Between bullets** control count was 0 rather than 1.

Raw logs:

- `test-results/bullet-preferences-red.log`
- `test-results/bullet-ui-red.log`

The current contract was re-established after the user's correction to separate line spacing and an 8px between-item default. The earlier zero-gap UI proposal was superseded before the UI implementation.

## GREEN

`node --import tsx tests/preferences.test.ts` passed **3/3**. Coverage includes old v2 files missing both fields, zero and maximum gaps, fractional line spacing, invalid values, existing v1 migration, and blocked or malformed storage. Raw log: `test-results/bullet-preferences-green.log`.

The sequential focused Electron command used:

```sh
node --import tsx --test --test-concurrency=1 --test-name-pattern='(Independent bullet line|precise math and prose)' tests/toolbar.e2e.ts
```

It passed **2/2**, 0 failures, in **39.76 seconds**. Raw log: `test-results/bullet-ui-green.log`. The process exited successfully before the GUI lease was released.

The integration test verifies:

- Default bullet line spacing 1 and between-item gap 8px, including native arrow and wheel changes.
- Prose line spacing 2 does not alter the default 1× bullet lines; a selected 1.5× bullet value produces 22.5px lines while prose retains its independent setting.
- Immediate PDF export after changing the gap from 8px to 12px places the second bullet 3pt farther down than the baseline PDF, proving the latest gap reaches actual PDF geometry.
- Immediate copy after changing to an 11px gap and 1.5× bullet lines contains those exact styles; the preview agrees.
- Saved Markdown bytes and clean state remain unchanged.
- A normal quit/restart preserves a 12px gap and 1.5× bullet lines.
- All settings fit an 880×600 window without clipping.

The new label **Bullet line spacing** made the old test's substring selector **Line spacing** ambiguous. Existing prose selectors now use exact labels. This was a test-selector repair, not an additional claimed RED cycle.

## Verification and visual review

Focused TypeScript and ESLint passed, followed by a successful production build. No gutter or other CSS changes were needed. Visual inspection confirms a clean compact popup at 880×600 and clean actual PDF pages for the 8px and 12px gaps. Proofs:

- `test-results/bullet-spacing-settings.png`
- `test-results/bullet-spacing-settings-880x600.png`
- `test-results/bullet-spacing8.pdf` and `bullet-spacing8-page.png`
- `test-results/bullet-spacing12.pdf` and `bullet-spacing12-page.png`

The parent agent owns the complete regression run, Writer acceptance, packaging, and final outputs. This change retains version 1.3.1.
