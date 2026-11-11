# ApeTek branding

ApeTek uses a geometric chimpanzee emblem with cobalt and navy outer facets,
emerald and teal accents, and a pale mint face. The faceted style was originally
inspired by the user's installed OwlDocs logo. Version 1.3.4 replaces the former
purple, magenta, orange and peach palette with blue and green.

`assets/apetek-logo.png` is the transparent 1254 × 1254 PNG.
`assets/icon.png` is the same artwork resized with transparent padding to
512 × 512 for the Linux desktop and native window icon. The React header
bundles the original artwork locally. No runtime image download is needed.

The original emblem and its palette edit were made using the built-in
`image_gen` tool. The blue/green edit uses the existing chimp as its target,
preserving its silhouette, expression and geometric style. The 512-pixel
derivative is resized on a transparent canvas with the existing icon's occupied
bounds as its sizing reference. Both images retain actual alpha transparency.
The app name is typeset separately in the UI. The original palette remains in
Git history.

## Final palette-edit prompt

Use case: precise-object-edit. Asset type: ApeTek desktop application logo,
transparent PNG. Image 1 is the EDIT TARGET, the existing faceted geometric
chimpanzee emblem. Recolor this exact chimp into a beautiful cohesive BLUE AND
GREEN palette. Use rich cobalt and royal blue with deep navy for the outer
forehead, cheeks and outer head facets; emerald and teal facets for the ears,
brow and face accents; pale mint and softly luminous sea-green for the muzzle
and face highlights. Keep dark navy eyes, nostrils and mouth with tiny pale
cream or mint eye highlights. Make the tonal contrast crisp enough to read as
a small desktop icon. Remove the original purple, magenta, orange and peach
color scheme. This is a PALETTE EDIT ONLY: preserve the exact chimp identity,
friendly calm expression, closed smiling mouth, rounded ears, front-facing
symmetry, proportions, silhouette, every polygon facet boundary, geometry,
crop and composition. Keep the existing low-poly triangle style and hard
sharp edges. Do not redesign or add facets, fur, textures, objects, text,
borders, shadows or a backing tile. Preserve a genuinely transparent background
and transparent margins. Deliver just the single recolored chimp emblem on
alpha transparency.

## Upgrade compatibility

The package and launcher are named `apetek`. Installing the new `.deb`
replaces the earlier `markdown-local` package. Markdown documents remain
ordinary `.md` files. ApeTek retains the earlier recovery-profile directory
to preserve any unsaved draft from Markdown Local.
