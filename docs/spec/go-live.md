# Go-live checklist

The proof of concept runs on fake data only. Real Spark data goes into Ping only once every item below is done. Running this checklist is not part of the planning map; it happens after the build.

## Agreements and records

- [ ] A processing agreement with Spark is in place.
- [ ] A record of processing activities for Ping is written.
- [ ] Every vendor DPA is accepted: Neon, Fly (requested from Fly support), Cloudflare (done during the R2 check), Brevo, Sentry and Better Stack.

## Storage

- [ ] On the Cloudflare account's R2 usage or billing page, confirm that EU-jurisdiction bucket usage counts against the R2 free allowance. The docs list no exclusion, but nobody has checked billing. The allowance is shared with Patrick's other R2 use on the same account.
- [ ] Revoke the test R2 token created for the `ping-r2-eu-check` bucket.
- [ ] The prod, staging and backup buckets exist with jurisdiction `eu`.

## Backups and monitoring

- [ ] The first manual restore drill is done and written up as a runbook.
- [ ] Every monitoring heartbeat (backup, restore test, both sweepers, quota check) has been green for a week.

## Email

- [ ] A test invite sent to a real Spark address reaches the inbox. If it doesn't, ask Spark's IT to allowlist the sender.
- [ ] After 2–4 weeks of clean DMARC reports, move `ping.bypatrick.app` to `p=quarantine`.

## Sources

- [How is Ping deployed, backed up and monitored?](https://github.com/Patchalv/ping/issues/12#issuecomment-6862919205)
- [Set up and verify an EU Cloudflare R2 bucket for Attachments](https://github.com/Patchalv/ping/issues/14#issuecomment-6863228101)
- [How do the first Admins get in, and how do invite and reset emails arrive?](https://github.com/Patchalv/ping/issues/15#issuecomment-6863586131)
