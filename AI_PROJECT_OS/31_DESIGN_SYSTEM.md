# 31 Design System

Source of truth: `src/theme.css` and `src/index.css`. These are the real tokens shipped today.

## Color tokens (CSS variables, from `src/theme.css :root`)

```
--emerald:       #1E5D4A   (primary brand green)
--emerald-deep:  #123c2e   (sidebar, headings)
--emerald-mid:   #174838
--champagne:     #D9CCB0   (accent / logo mark)
--ink:           #2c2a26   (body text)
--muted:         #7d776c   (secondary text)
--line:          #e7e1d6   (borders)
--ivory:         #f7f4ee
--bg:            #f3efe6   (page background)
--white:         #fff
--green:         #2f8f5b   (success)
--amber:         #b8860b   (warning)
--red:           #b3413a   (error)
--radius:        13px
```

## Typography

- Display / headings: "Cormorant Garamond" (serif), weights 500-700. Applied to `h1, h2, h3` and `.serif`. Headings render in `--emerald-deep`.
- Body / UI: "Inter" (sans), weights 400-700; `system-ui` fallback.
- Both loaded from Google Fonts in `theme.css`.

## Core layout classes

- `.app` - flex shell, min-height 100vh.
- `.sidebar` - 230px, `--emerald-deep` background, white text, brand mark + nav.
- `.brand` - logo mark (`.mk`, champagne tile) + name (`.nm`) + tagline (`.tg`).
- `.nav a` - nav items; `.nav a.active` uses `--emerald`.
- `.topbar` - 58px, white, bottom border `--line`.
- `.content` - 24px padding, max-width ~1180px.
- `.page-head` / `.page-head h1` (30px) / `.sub` - page header pattern.

## Visual language

- Soft, editorial, "champagne and emerald" palette: warm ivory/beige backgrounds, deep emerald chrome, champagne accent, serif display type over sans body. Conveys premium / boutique event branding rather than a stark SaaS look.
- Default radius 13px; thin warm borders (`--line`).

## Components

- Shared UI in `src/components/` and `src/components/marketing/`; page-local components under `src/pages/components/`.

> TODO(owner): If a formal component library / Storybook exists or is desired, catalog the canonical components (buttons, cards, tables, modals, form fields) and their variants here. Currently components are defined ad hoc per page plus the shared CSS classes above.
