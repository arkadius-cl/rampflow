---
title: Register your company
description: As a warehouse operator, register your company at /signup, confirm your email, handle the duplicate hint and an expired link, and know what happens after the tenant is created.
type: how-to
audience: [tenant-admin, developer]
tags: [registration, tenancy, auth, tax-id, onboarding]
status: stable
updated: 2026-10-21
related: [docs/how-to/onboard-a-tenant.md, docs/decisions/ADR-0016-tenant-self-registration.md, docs/explanation/mvp-scope.md]
---

# Register your company

This guide creates your company on rampflow and makes you its administrator. You need a work email address that you can read now, and your company's tax number. Registration is free and creates your company on the Start package. Nobody has to approve it.

## 1. Fill in the form

1. Open the sign-in page and select **Register your company**, or open `/signup` directly.
2. Choose a salutation, or leave it at **No answer**. rampflow uses it only to greet you in emails.
3. Enter your first name, last name, work email and a password of at least 10 characters.
4. Enter the company name and choose the country of the company. Only the 27 EU member states are available.
5. Choose the type of tax number. The list shows only the types for your country:
   - **EU VAT number**, with or without the country prefix, in every EU country.
   - **Tax number or W-IdNr** in Germany: the Steuernummer with 10, 11 or 13 digits, or the Wirtschafts-Identifikationsnummer, for example `DE123456789-00001`.
   - **NIP** in Poland: 10 digits, for example `526-025-02-74`.
6. Enter the number. Spaces, dots, hyphens and slashes do not matter. The form checks the format and the check digit before it sends.
7. Select **Register company**. An automatic check against bots runs in your browser first. It takes a few seconds and needs no input from you.

The form refuses addresses of disposable email services. Use your company's address.

## 2. Confirm your email

1. The page shows **Check your inbox** with your address. Open the email "Confirm the registration of <company> on rampflow".
2. Select **Confirm and create company**. The page shows your email and the company name.
3. Select **Create company**.

The link works once and for 24 hours. Select **Send again** on the "Check your inbox" page if no email arrives after a few minutes; check your spam folder first. Only the newest link works.

If the email address already has a rampflow account, you get the email "You already have a rampflow account" instead. Sign in with that account; use **Forgot your password?** on the sign-in page if needed.

## 3. If the page says your company may already use rampflow

The confirmation page shows **Your company may already use rampflow** when another company on rampflow has the same tax number or has members with the same company email domain. The page does not name that company.

- If a colleague already runs your company on rampflow, do not create a second one. Ask that colleague, the company's admin, to invite you.
- If you are sure that your company is not on rampflow yet, select **Create company anyway**. The platform operator sees that the company may be a duplicate.

## 4. If the link no longer works

The page shows **This link no longer works** when the link was used, is older than 24 hours, or was replaced by a newer one from **Send again**. Select **Register again** and fill in the form once more. A registration that you do not confirm is deleted 7 days after its link expired.

If the page says **You already have an account**, someone created an account with your email after you registered. Select **Sign in**.

## 5. What happens next

- Your company exists on the Start package, and you are its administrator. rampflow signs you in and opens your company's home page.
- The company starts in the status **Onboarding**. Set it up next: invite your staff, configure settings and upload your logo, as [Onboard a tenant](onboard-a-tenant.md) describes from step 5.
- An EU VAT number is confirmed against the European Commission's VIES service in the background. While VIES is not reachable, nothing waits for it. A German tax number or W-IdNr and a Polish NIP are checked for format only.
- For a larger package, contact the platform operator.
