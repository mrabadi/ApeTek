# ApeTek branding

ApeTek uses a geometric chimpanzee emblem with cobalt and navy fur and emerald
and teal fur highlights. The face, muzzle and inner ears retain warm peach,
apricot, cream and coral skin tones. Version 1.3.6 softens the orange skin around
the eyes to muted peach and changes the nose from purple to blue. The faceted
style was originally inspired by the user's installed OwlDocs logo.

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

Use case: precise-object-edit. Make a very small, precise palette correction to this existing transparent ApeTek geometric chimp logo. Preserve ALL polygon boundaries, shapes, expression, symmetry, silhouette, proportions, crop, transparent margins, and existing cobalt/navy/emerald/teal FUR exactly. Only two color changes: (1) The bright saturated orange/yellow skin facets immediately surrounding both eyes should become understated soft warm PEACH, muted APRICOT, and warm CREAM. Reduce their orange saturation substantially so the eye areas harmonize naturally with the pale peach muzzle and brow skin. No vivid orange or yellow eye rings. Keep all eye shapes, dark pupils, cream glints, eyebrow contours and facial geometry exactly unchanged. Preserve natural warm peach/coral skin elsewhere on the face and inner ears. (2) Recolor the currently PURPLE/PLUM nose into a clear deep COBALT BLUE nose with NAVY BLUE nostrils and a softly lighter BLUE central highlight. Remove every purple/magenta tone from the nose; its shapes and facets must remain exactly the same. Blue nose, soft natural peach eye skin, unchanged blue-green fur. Do NOT redesign, do NOT add details, do NOT change the overall face colors to blue/green, no texture, no text, no background tile, no border, no shadow. Output the same single crisp faceted chimp emblem on genuine alpha transparency.

## Upgrade compatibility

The package and launcher are named `apetek`. Installing the new `.deb`
replaces the earlier `markdown-local` package. Markdown documents remain
ordinary `.md` files. ApeTek retains the earlier recovery-profile directory
to preserve any unsaved draft from Markdown Local.
