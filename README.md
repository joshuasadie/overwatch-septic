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
