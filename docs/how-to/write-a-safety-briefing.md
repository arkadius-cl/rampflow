---
title: Write and publish a safety briefing
description: Create a briefing from the 12-language template, adapt the rules, review translations, set up the quiz, publish with or without a material change, and check the acknowledgement register.
type: how-to
audience: [tenant-admin, dispatcher]
tags: [safety, i18n]
status: stable
updated: 2026-10-19
related: [docs/explanation/mvp-scope.md, docs/reference/api-routes.md, docs/explanation/research/domain-standards.md]
---

# Write and publish a safety briefing

Drivers read the briefing on their phone and confirm it before they enter a site (SF-01, SF-04). This guide covers the staff side. You need the tenant admin role. The register at the end also works for dispatchers.

## Create the briefing

1. Open **Safety briefings** in the sidebar.
2. Select **New briefing**.
3. Enter a name. Only staff see this name.
4. Under **Applies to**, select **All sites**, or select **Chosen sites** and tick the sites.
5. Select **Create and edit**.

Version 1 opens as a draft. It has the platform template in 12 languages. German and English are flagged **Source**. The other languages are flagged **Machine translation**.

The **New briefing** button is off when your package limit (`safety.max_briefing_templates`) is reached. The usage box shows the count. To free a place, open the row menu of an old briefing and select **Archive**.

## Edit a language

1. In **Languages**, select the language.
2. Change the title, the rules and the confirmation statement. A rule is a text block or a pictogram. A pictogram shows above the text that follows it. Use the arrows to reorder the rules.
3. When a speaker of the language has checked a machine translation, set **Translation status** to **Reviewed**. Drivers then see the language without the "auto" mark (DR-02).
4. Select **Save** for that language. Each language saves on its own. Unsaved changes are lost when you switch the language.

## Set up the quiz

With the `safety.quiz` feature, each language has a **Quiz** section. Every language you publish needs 3 to 5 questions. Each question has 2 to 4 answers. Select the radio button next to the correct answer.

Without the feature, the section is hidden and drivers confirm the rules without questions.

## Publish

1. Select **Publish**.
2. Decide on **Material change**:
   - On: drivers who confirmed an earlier version must confirm this one before their next check-in. Use it when the rules change.
   - Off: earlier confirmations stay valid. Use it for typos and wording.
3. Select **Publish now**.

When a language does not have 3 to 5 questions, the dialog names the languages. Fix them and publish again.

A published version cannot change. To change it, select **Edit as new version**. The new draft copies the latest version. Drivers keep seeing the published version until you publish the draft.

## Check the register

Open **Acknowledgements**. Each row shows when a driver confirmed which version, in which language, with the quiz score and the validity. Times show in the site's time zone.

Filter by driver name, site, carrier, briefing and version, or status:

- **Valid**: confirmed and not expired.
- **This visit only**: valid only for the booking it was completed for, because `safety.validity` is off or `safety.validity_days` is 0.
- **Expired**: older than `safety.validity_days`.
- **Outdated**: a material change was published after it.

Select **Export CSV** to download the rows of the current filters. The file uses the delimiter of your language (a semicolon in German and Polish, a comma in English) and opens in Excel with the right characters.
