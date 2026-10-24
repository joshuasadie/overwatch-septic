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
