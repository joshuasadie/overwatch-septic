# Overwatch Septic

Static site (`site/`) plus one Cloudflare Worker endpoint (`worker/index.js`, `POST /api/request`) that emails each request to the owner and a confirmation to the homeowner. Nothing is stored.

## Deploy (Cloudflare)
1. Cloudflare dashboard > Workers & Pages > Create > Import a repository > `overwatch-septic`. Build command: none. Deploy command: `npx wrangler deploy`.
2. Worker > Settings > Variables and secrets, add secrets: `RESEND_API_KEY`, `TURNSTILE_SECRET`.
3. Turnstile: add `overwatchseptic.com` and `www.overwatchseptic.com` to the widget hostnames (site key is in `site/index.html`).
4. Resend: verify the `overwatchseptic.com` domain (add the DNS records it shows in Cloudflare DNS). Until then, change `MAIL_FROM` in `wrangler.jsonc` to an address on `septicoperators.com`.
5. Worker > Settings > Domains & Routes: add custom domains `overwatchseptic.com` and `www.overwatchseptic.com`. Remove the old web DNS records for those names first. Keep the MX and TXT (email) records.

## Test
`npm test` runs the form endpoint tests.

## Portals (branch `portals`)

Pages: `/admin/` (you), `/c/<token>` (customer signs from the emailed link), `/login/` then `/portal/` (customer). Tests: `npm test` (API) and the browser checks described in the pull request.

Setup before merging:
1. Cloudflare dashboard > Storage & databases: create a D1 database `overwatch-septic` and an R2 bucket `overwatch-septic-files`. Paste the D1 id into `wrangler.jsonc` (`database_id`). Tables are created automatically on first use.
2. Zero Trust > Access > Applications: add a self-hosted app for `overwatchseptic.com/admin*` (and `/admin/api*` is covered by the same path), policy allowing only your email. Copy the Application Audience (AUD) tag and your team domain into `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`.
3. Add `overwatchseptic.com` and `www.overwatchseptic.com` to the Turnstile widget hostnames (the customer sign-in uses it) and make sure `TURNSTILE_SECRET` and `RESEND_API_KEY` are set as secrets on the Worker.
4. Merge, then try: add yourself as a customer, send yourself a contract, sign, countersign, add a report, sign in at `/login/`.

## Payments (branch `payments`)

What it does: an origination fee is invoiced when you countersign a contract, and a visit invoice when you save a report. Nothing is released (the signed agreement, or the report to the customer and the county) until the invoice is paid and 3 business days have passed. You can waive any fee (it releases at once). Unpaid invoices get 7 daily reminders, one on day 15, a drafted notice on day 30 that needs your OK before it goes to the owner and the county, and a drafted final notice on day 60 that also needs your OK. A daily job (8 am Eastern) does the reminders and the releases.

Setup:
1. Stripe: create an account for Overwatch Septic. In Developers > API keys, copy the **secret key**.
2. Stripe > Developers > Webhooks > Add endpoint: URL `https://overwatchseptic.com/stripe/webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`. Copy the **signing secret** (starts `whsec_`).
3. Cloudflare > the overwatch-septic Worker > Settings > Variables and Secrets: add secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Use Stripe's test keys first and pay with card 4242 4242 4242 4242 to try the whole flow, then switch to live keys.
4. The daily job is the `triggers.crons` line in `wrangler.jsonc` and deploys with the Worker.
5. In the admin portal, add each county's Environmental Health email under Counties. Without it, county copies and notices are blocked and you are told.

Tests: `npm test` runs the API tests, including a clock that moves day by day through the 60-day sequence.
