# ApeTek branding

ApeTek uses a geometric chimpanzee emblem with cobalt and navy fur and emerald
and teal fur highlights. The face, muzzle and inner ears retain their original
warm peach, apricot, cream and coral skin colors. The faceted style was originally
inspired by the user's installed OwlDocs logo. Version 1.3.5 restores the warm
skin tones while keeping blue and green on the fur.

`assets/apetek-logo.png` is the transparent 1254 × 1254 PNG.
`assets/icon.png` is the same artwork resized with transparent padding to
512 × 512 for the Linux desktop and native window icon. The React header
bundles the original artwork locally. No runtime image download is needed.

The original emblem and its palette edit were made using the built-in
`image_gen` tool. The palette edit uses the original warm-skinned chimp as its
target, preserving its silhouette, expression and geometric style. The 512-pixel
derivative is resized on a transparent canvas with the existing icon's occupied
bounds as its sizing reference. Both images retain actual alpha transparency.
The app name is typeset separately in the UI. The original palette remains in
Git history.

## Final palette-edit prompt

Use case: precise-object-edit. Asset: transparent geometric chimpanzee logo for ApeTek. Image 1 is the EDIT TARGET: the ORIGINAL chimp with WARM PEACH SKIN. Image 2 is only a reference for BLUE/GREEN FUR colors; its green face is explicitly WRONG and must NOT be copied. Make one restrained palette correction to Image 1: recolor ONLY its purple/magenta FUR on the crown, temples and outer cheek/head facets into cobalt blue and deep navy, with tasteful emerald/teal highlights ONLY in the fur. PRESERVE THE ORIGINAL WARM NATURAL SKIN COLORS from Image 1 exactly: peach, apricot, warm cream and soft coral on the muzzle, chin, cheeks around the eyes, forehead/brow skin band and inner ears. The entire projecting muzzle must remain warm peach, NOT green or mint. Ear skin must remain warm peach/apricot, NOT green. Facial skin around the eyes must remain warm peach/apricot, NOT blue or green. Keep natural dark navy/charcoal eyes, nostrils and mouth, and cream eye highlights. This is a chimp, not an alien. Maintain every original polygon boundary, shape, recognizable chimp anatomy, front-facing symmetry, friendly calm expression, closed smiling mouth, large rounded ears, proportions, silhouette, crop and transparent margins of Image 1. Keep clean crisp low-poly facets, no added texture, no new details, no redesign, no text, no background tile, no border, no shadow. Deliver the single original-style chimp emblem on genuine alpha transparency. Blue and green belong ONLY on the fur and fur highlights; all exposed skin stays its original warm peach color.

## Upgrade compatibility

The package and launcher are named `apetek`. Installing the new `.deb`
replaces the earlier `markdown-local` package. Markdown documents remain
ordinary `.md` files. ApeTek retains the earlier recovery-profile directory
to preserve any unsaved draft from Markdown Local.
