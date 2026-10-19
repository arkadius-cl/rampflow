---
title: Open and test the driver PWA
description: How to open a driver link in development, simulate a phone, a call, an offline phone and a second visit, and check the 150 KB budget and the first render of apps/driver.
type: how-to
audience: [developer, agent]
tags: [driver, pwa, testing, safety, i18n]
status: stable
updated: 2026-10-19
related: [docs/decisions/ADR-0008-driver-token-pwa-delivery.md, docs/reference/api-routes.md, docs/how-to/run-locally.md]
---

# Open and test the driver PWA

The driver PWA in `apps/driver` shows one booking to a driver without an account: slot, address, code with QR, safety briefing, waiting state and dock call ([ADR-0008](../decisions/ADR-0008-driver-token-pwa-delivery.md)). Use these steps to open it in development and to check its behavior.

## Start the servers

The PWA must run on the same origin as the API, so open it through the web dev server.

1. Start the API and the web app: `pnpm dev`.
2. In a second terminal, start the driver dev server: `pnpm --filter @rampflow/driver dev`. It listens on `DRIVER_PORT` under `/d/`.
3. Open driver links on the web port. The web dev server forwards `/d` to the driver server and `/api` to the API.

## Open a driver link

1. Sign in as a dispatcher of a demo tenant and open a booking. Copy its driver link (CR-06), or read the link from the booking email in Mailpit.
2. Open the link, `http://localhost:<WEB_PORT>/d#<token>`, in a browser window.
3. Check that the address bar shows `/d/` without the token. The PWA has exchanged the token for the `rf_driver` cookie.

To see the phone layout, open the browser's device toolbar and select a phone, for example Pixel 7.

## Simulate the visit

- **Language (DR-02).** Select a language in the header. Machine-translated languages show the "auto" badge. To test the browser language, clear the site data and change the browser's preferred languages.
- **Briefing (SF-04).** Publish a briefing for the tenant first (Safety, then Briefings). The booking screen then shows "Start safety briefing".
- **Check-in and call (DR-03).** Check the truck in at the gate and call it to a dock. The PWA shows the change after at most 15 seconds, or at once when the tab becomes visible again.
- **Offline.** Set the network to offline in the developer tools. After the next poll the PWA shows "Offline. Showing status from HH:mm" above the last known state.
- **Next visit at the same tenant.** Complete the briefing on one booking, then open the link of another booking of the same tenant in the same browser. The booking screen shows "Safety briefing valid until" instead of the briefing.

## Check the budget and the first render

1. Run `pnpm --filter @rampflow/driver size`. The command builds the PWA and fails when the initial JavaScript exceeds 150 KB gzip.
2. Run `pnpm test:e2e e2e/driver --project=driver`. The DR-01 spec loads the production build with Lighthouse's mobile throttling and fails when the booking renders later than 3 seconds after navigation.

A Lighthouse run against a production deployment stays a manual release check.
