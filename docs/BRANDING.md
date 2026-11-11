# ApeTek branding

ApeTek uses the user-approved geometric chimpanzee emblem with cobalt and navy
fur, emerald and teal highlights, a blue nose, and dark chocolate-brown eyes.
Its face and inner ears have soft warm peach/apricot/cream skin, with teal along
the outer ear rims. Version 1.3.7 applies the exact approved review image.
The faceted style was originally inspired by the user's installed OwlDocs logo.

`assets/apetek-logo.png` is the transparent 1254 × 1254 PNG.
`assets/icon.png` is the same artwork resized with transparent padding to
512 × 512 for the Linux desktop and native window icon. The React header
bundles the original artwork locally. No runtime image download is needed.

The original emblem and its palette edit were made using the built-in
`image_gen` tool. The approved palette edit uses the preceding chimp image as its
target, preserving its silhouette, expression and geometric style. The 512-pixel
derivative is resized on a transparent canvas with the existing icon's occupied
bounds as its sizing reference. Both images retain actual alpha transparency.
The app name is typeset separately in the UI. The original palette remains in
Git history.

## Final palette-edit prompt

Use case: precise-object-edit. Asset: PREVIEW-ONLY revision of this existing transparent ApeTek faceted geometric chimp logo, for the user's review. Image 1 is the edit target. Make only these localized color refinements: (1) Restore visible rich DARK CHOCOLATE BROWN / ESPRESSO BROWN eyes. The large rounded eye fills must read as warm dark brown, not navy, purple, blue or featureless black. Keep the pupils near-black and the existing small cream catchlights, keeping the exact eye shapes and friendly expression. Do not add realism, new eye rings or extra outlines. (2) Recolor the existing saturated orange OUTER RIM facets of BOTH ears to restrained emerald/TEAL matching the existing fur accents. The INSIDE of each ear stays natural, soft muted PEACH / APRICOT / CREAM skin, with much less orange saturation than the current ears; no vivid orange or red ear facets. Teal is only on the outer ear rim. Preserve the current cobalt BLUE NOSE with navy nostrils, soft warm peach facial skin and eye surrounds, cobalt/navy fur with teal/green highlights, closed smile, all existing polygon boundaries, geometry, symmetry, crop, silhouette and transparent margins. Do not redesign anything, change proportions, add details or texture, or recolor the face to blue/green. No text, border, background tile, shadow or watermark. Output the single same chimp emblem on genuine alpha transparency.

## Upgrade compatibility

The package and launcher are named `apetek`. Installing the new `.deb`
replaces the earlier `markdown-local` package. Markdown documents remain
ordinary `.md` files. ApeTek retains the earlier recovery-profile directory
to preserve any unsaved draft from Markdown Local.
