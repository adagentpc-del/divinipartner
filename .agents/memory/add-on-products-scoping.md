---
name: Add-on products scoping
description: Invariant for which add-on products the live ordering portal may show.
---

# Add-on products scoping (live ordering portal)

**Invariant:** the live customer add-ons step must show ONLY the add-on products an
admin curated for that partner. It must NEVER fall back to the full product catalog.

**Why:** a `products.filter(...)` fallback once leaked the entire global catalog
(~30 products) onto portals that had no curated add-ons (e.g. Social Commerce
Festival). When a partner has no curated library, the resolved list must be empty
and the portal shows its premium empty state.

**How to apply:** curation already exists — a per-partner add-on library plus an
optional per-event override narrowing it. Do NOT create a new table for this, and
do NOT reintroduce any "show all products" fallback in the add-ons step.
