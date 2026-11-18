# Chefos November release runbook

Target project: gvkzgipicojtlzwdnthk. Admin stays on localhost.

## Confirmed product choices

- Instant: customer selects cuisine and chef, chef accepts, customer pays.
- Instant dishes/recipes are agreed on arrival and confirmed by the customer.
- Paid subscription days begin on the selected first cooking date.
- Same verified building: 30-minute gap only with chef confirmation for the date.
- Configurable AI and identity integrations; no client self-asserted face pass.

## Backend rollout

1. Confirm project is ACTIVE_HEALTHY. It was INACTIVE on November 13; the owner
   resumed it and the management API subsequently reported COMING_UP.
2. Inspect active captured legacy plans, in-progress cooking and pending payments.
   Preserve a private pre-release schema rollback snapshot. Customer-data export
   requires explicit approval; the deployed release saved function definitions only. Do not deploy stricter gates
   over unreconciled active legacy services: they need verified visit addresses and
   accepted recipes. Existing paid wave times and stored rates must remain intact.
3. Apply migrations 202611130001 through 202611130014 in order. Test all of them
   locally with `cd supabase; npm test` before hosted deployment.
4. Apply `supabase/setup/private_recording_storage.sql` in hosted Supabase. This
   private bucket has no direct customer/chef listing, reading or mutation grants.
5. Deploy chefos-api, chefos-payments-webhook, chefos-menu-worker,
   chefos-face-webhook and chefos-recordings with matching config.toml.
6. Set server secrets using Supabase's secret manager, never a public app variable:
   OPENAI_API_KEY, CHEFOS_MENU_MODEL; RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
   RAZORPAY_WEBHOOK_SECRET; CHEFOS_JOB_SECRET (random, at least 32 bytes).
7. Set DIDIT_API_KEY for native registration selfies and per-visit selfie/liveness
   checks. The partner app captures the registration selfie after email confirmation
   and sign-in. A successful enrolment is required for chef approval and going online.
8. Set Vault chefos_project_url and chefos_job_secret (same worker secret), then
   apply `supabase/setup/enable_automation.sql`. Verify the named cron job exists,
   produces successful HTTP responses in chefos_private.worker_runs and processes
   jobs while both apps close. The dispatcher uses the http extension directly:
   Supabase-managed pg_net queue tables had PUBLIC grants that postgres could not
   revoke, so credentials are never queued. The original worker key was rotated.
   Without cron the automatic weekly rotation and footage purge are not live.
9. Use non-production provider modes/test identities for capture/refund/replay,
   real AI profile/allergen checks and signed liveness tests. Never insert a paid
   payment or passed identity to make a production test appear successful.
10. Release matching customer/partner 1.1.0 APKs. Verify native camera, no audio,
    short first clip, full segment playback, background pause, offline recovery,
    resume OTP, completion, retention and complaint access on physical devices.

## Registration and visit selfies

The native flow uses Didit passive liveness for registration and visits, followed
by a 1:1 comparison against the locked registration image at each visit. Set
DIDIT_API_KEY in Edge secrets. CHEFOS_FACE_MATCH_THRESHOLD defaults to 50 and
CHEFOS_LIVENESS_THRESHOLD defaults to 30, following the provider example settings.
Both thresholds are configurable server settings. Provider results must also be
Approved, have one detected face, and contain no error-severity warnings.

Images use the private chefos-selfies bucket. Registration references are written
to a server-only path. Verification uploads use short-lived, immutable attempt
paths with owned claims and replay checks. Visit uploads are deleted after the
result, with scheduled cleanup for expired attempts and interrupted uploads.
Signed-upload paths are rechecked through their token lifetime.

The capture screen uses the device camera. Provider passive liveness and face
matching still require real-device validation, including spoof attempts and
false rejections. Camera provenance is not hardware-attested.

Provider references are the [Didit passive liveness API](https://docs.didit.me/standalone-apis/passive-liveness)
and [Didit face-match API](https://docs.didit.me/standalone-apis/face-match).

## Legacy identity gateway contract

CHEFOS_FACE_PROVIDER_URL is an HTTPS gateway that implements this contract; it is
not a generic URL that can point at an arbitrary vendor API without an adapter.
Set CHEFOS_FACE_PROVIDER_KEY, CHEFOS_FACE_WEBHOOK_SECRET and a comma-separated
CHEFOS_FACE_ALLOWED_ORIGINS allowlist for the vendor's hosted verification pages.

The server POSTs challenge_id, enrollment_reference, expires_at, callback_url and
return_url with bearer gateway authorization. The gateway returns JSON:
`{"id":"vendor-session-id","verification_url":"https://allowed-origin/..."}`.
The enrolled reference comes from the local admin's verified chef identity record.

The gateway POSTs the raw result JSON to chefos-face-webhook, including
challenge_id, provider_session, enrollment_reference, event_id, match (boolean)
and liveness (boolean). Headers x-chefos-timestamp (Unix seconds) and
x-chefos-signature (lowercase HMAC-SHA256 of `timestamp.rawBody` using the webhook
secret) bind the evidence. Results older than 5 minutes are rejected. Challenge,
provider session and enrolled identity must match; events are replay-idempotent.
A selfie or client `passed=true` never satisfies this boundary.

## Hosted release verified on November 13

- All 23 migrations and five Edge Functions deployed, including private selfie enrolment.
- Preflight: zero active captured plans, cooking sessions and pending orders.
- Private recording bucket and approved Vault/Edge worker credential configured.
- Minutely direct HTTPS calls return 200; dispatcher/log/Vault access is denied
  to client roles. No Chefos worker requests remain in the pg_net queue.
- No live AI/payment/biometric submission was performed. Provider secrets and
  gateway enrolment remain necessary for the real cooking journey.
- Internal EAS builds: customer 73297f1a-d3c3-4d2f-8ff4-00de27d113ca;
  partner 034d3a0e-f787-4ef5-b332-d2d184a1f00f. Both are queued; there are
  no new download artifacts at the time of this verification.

## Known operational limits

- An internal one-hour arrival allowance reserves instant dispatch capacity. It is
  not a customer ETA. Real route-based ETA/push notifications need provider setup.
- Camera origin is not hardware-attested. Container validation and authenticated
  capture sequencing improve integrity but cannot prove a modified device honest.
- Backgrounding/stopping the camera pauses cooking. Uploads can retry offline;
  startup/resume requires recent server evidence. Clearing app data can destroy
  unuploaded footage, so the app retains it and blocks normal logout until synced.
- Private video viewers buffer short clips; they do not expose public links or
  save footage to the device gallery. Retention is cloud-side; an already viewed
  file cannot be revoked from a customer's physical possession.
- A complaint preserves footage still retained when opened. Deletion already
  claimed after expiry cannot be undone by a later complaint.
- Payment capture after capacity/date loss needs support reconciliation or refund.
  No automatic refund or payment completion is claimed without provider evidence.
- Provider credentials, a deployed gateway and successful native-device tests are
  needed before calling this workflow production-ready.

The Vault setup follows the [Supabase Vault documentation](https://supabase.com/docs/guides/database/vault).
The private dispatcher uses the [Supabase HTTP extension](https://supabase.com/docs/guides/database/extensions/http).
