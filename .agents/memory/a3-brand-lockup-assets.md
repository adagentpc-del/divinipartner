---
name: A3 brand lockup assets
description: The bundled A3 Visual logo files act as the universal fallback; they once shipped empty.
---

# A3 brand lockup placeholder assets

The portal's universal logo/product-image fallback resolves to the bundled A3 Visual
lockup JPEGs under the a3-portal `public/brand/` dir (light + dark variants).

**Pitfall / durable lesson:** these two files were once committed as **0-byte** files,
which silently broke EVERY A3 fallback (header, footer, full portal, and every
missing/broken product image) with no console error.

**Why it matters:** any feature that "falls back to the A3 logo" depends on these
binaries actually having bytes. A passing typecheck does NOT prove the fallback
renders — verify the asset serves `200 image/jpeg` and shows the wordmark.

**Brand:** gold "A3" (#c8a86b) + navy/white "VISUAL" (light = light bg, dark = navy
#0b2545 bg). ImageMagick is available in the env to regenerate them if needed.
