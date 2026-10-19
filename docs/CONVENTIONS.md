---
title: Documentation conventions
description: How docs in this repo are organized (Diátaxis), the required frontmatter, and how the index is generated.
type: reference
audience: [agent, developer]
tags: [docs, conventions]
status: stable
updated: 2026-10-19
---

# Documentation conventions

Docs follow [Diátaxis](https://diataxis.fr). Each file lives in the folder of its type.

| Folder | Type | Purpose |
|---|---|---|
| `docs/tutorials/` | `tutorial` | Learning by doing. A guided first run. |
| `docs/how-to/` | `how-to` | Task recipes for someone who knows what they want. |
| `docs/reference/` | `reference` | Facts: data model, API, entitlements, settings keys. |
| `docs/explanation/` | `explanation` | Background, research, rationale, concepts. |
| `docs/decisions/` | `explanation` | Architecture decision records (ADR-NNNN-slug.md). |

## Frontmatter

Every Markdown file under `docs/` starts with YAML frontmatter:

```yaml
---
title: Short title
description: One sentence. Agents use this line to decide whether to open the file.
type: tutorial | how-to | reference | explanation
audience: [agent, developer, platform-admin, tenant-admin, carrier, driver, gate-operator]
tags: [booking, yard, safety, avis, entitlements, settings, i18n, auth, tenancy, ...]
status: draft | stable
updated: YYYY-MM-DD
related: [docs/reference/data-model.md]   # optional, repo-relative paths
---
```

## Index

`docs/INDEX.md` is generated. Do not edit it by hand. Run `pnpm docs:index` after adding or changing a doc. `pnpm docs:check` fails on missing or invalid frontmatter and on a stale index.
