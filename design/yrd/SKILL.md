---
name: yrd-design
description: Use this skill to generate well-branded interfaces and assets for yrd.app (Zeitfenster- und Yard-Management), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, and explore the other available files (tokens/, components/, guidelines/).
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key rules: Tailwind v4 classes only, tokens from tokens/theme.css (shadcn naming + status/punctuality/density), `.dark` for dark mode, `data-density="halle"|"fahrer"` for hall/driver density, lucide icons with text, never colour alone, Carrier and Fahrer never see Rampenzeit.
