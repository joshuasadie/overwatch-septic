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

## Inspection reports

`New inspection` on a customer in the admin opens the form modeled on the state's certified operator maintenance/monitoring report. It makes two copies from one visit: a plain-language homeowner report (portal and PDF) and the technical county report (emailed link and PDF). Notes:

- Calculations (depth pumped, volume, PDR and PDR efficiency, sludge percent, per-day meters, design events) are done in `site/inspect-core.js`, which both the browser and the Worker use. The Worker recomputes them when a report is saved.
- Tank sizes, design numbers and laterals are saved per customer (`systems` table) after the first report. Each report is stored in `inspections`. No existing tables changed.
- Pump warning at 33% sludge of the liquid depth; PDR warning outside 90% to 110% of design.
- Operator name and certificate come from `OPERATOR_NAME` and `OPERATOR_CERT` in `wrangler.jsonc`.
- Photos: JPEG only, resized in the browser, up to 8 per report, stored in the R2 bucket under `reports/<id>/`. The owner sees them only after the report is released.
- Private comments are never sent to the owner or the county.
- Canned wording and job lists live in `site/inspect-core.js` (`WORDS`, `JOBS`, `TICKS`).

### Flexible systems (System setup)

Each customer has a **System setup** (admin > customer > System setup): permit and county details (issue date, months valid, permit numbers, bedrooms, inspection schedule), addresses, names for the first tanks, any number of extra septic and pump tanks, whether field lines are called laterals or zones, and **check cards** (yes/no lists such as drip headworks, a treatment unit or permit conditions). Templates only pre-fill check cards. The visit form is built from the setup: every tank gets its own checks, readings and calculations, every card its own checks, and you can add a check on the spot (it is kept for next time). Tank sizes and float settings typed during a visit are remembered on the system.

The **zones** (field lines) are entered in setup too: how many, length of each and an optional design head. The visit form's lateral table starts from them (`system.laterals`).

Each tank can also carry the **pump** (pump tanks) or **effluent filter** (septic tanks) make and model, e.g. `Little Giant 509207`, `Polylok PL-68`. Setup suggests names already used at other sites (`GET /admin/api/units`) so spellings match. Each pump tank also has an optional **timed float** reading, and every visit records **pump running amps** (`data.amps`, `data.tanks[id].amps`) so the same pump can be compared across sites later. These print on the county report.

The form warns when the operation permit has expired or is about to, suggests the next check-up from the permit schedule, and counts 48 hours from a malfunction. Problems on extra tanks and cards always appear in the owner's "What you need to do". The county copy prints the permit dates but never the word "expired". Older inspections without extras still render as before. Data lives in the `systems` row (`permit`, `addresses`, `tanks`, `cards`) and in each inspection (`tanks`, `cards`, `malfunction`, `sysinfo`), so no schema change is needed.
