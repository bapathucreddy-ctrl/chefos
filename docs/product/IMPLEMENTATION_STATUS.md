# Implementation progress - 2026-11-13

The November core workflow is implemented and deployed to the restored Supabase
project. There are 23 hosted migrations (9 original and 14 November) and five
matching Edge Functions. The October verification APKs do not contain this work.
New 1.1.0 internal APK builds have been submitted to EAS and are queued.

## Customer app

- Typed private food/health profile, calculated BMI, dietary days, cuisines,
  allergens, goals, restrictions, allergy confirmation and personalisation consent.
- Verified community/flat and chef service-radius checks.
- Weekly, monthly and quarterly plans; first selected cooking date begins the
  paid term. One meal reserves 60 minutes; combined meals reserve consecutive
  cooking hours. Separate/together grouping uses the same canonical meal price.
- Personalised menu preview before payment, full recipes, editable future dishes,
  customer acceptance and optimistic menu versions. Replacement editor is inline.
- Cuisine-based targeted instant selection, chef acceptance before payment,
  verified captured-payment activation and recovery without another charge.
- Instant dishes are chosen with the customer on arrival, recorded by the chef,
  confirmed by the customer and locked to the start-OTP recipe version. They do
  not require an AI subscription preview or create a fake subscription.
- Visit consent, current verification/recording state, private start/end codes,
  recipe display, private footage playback and support complaints.

## Chef app

- All seven days seeded with breakfast 06:00/08:00/10:00, lunch 12:00/14:00/16:00,
  dinner 18:00/20:00/22:00. Add/remove recurring starts and dated leave.
- Paid bookings/holds protect capacity. Default 60-minute travel/turnaround;
  30 minutes only in the same verified building with chef confirmation by date.
- Targeted offers include cuisine, meals, household size and building name.
  Paid assigned visits include their saved address and navigation coordinates.
- Arrival location, both recording consents, hosted face/liveness challenge,
  camera, hygiene checklist, allergy review, recipe steps, start/end OTPs.
- No-audio kitchen videos are segmented and retained in app-private files with
  per-segment manifests. Offline/retry uploads require server receipts before
  deleting local footage. Camera interruption pauses cooking and requires a
  customer resume code. App/account isolation protects pending recordings.

## Supabase and admin

- Fourteen November SQL migrations: private profiles, dated interval reservations,
  payment holds, menu/version/job records, session evidence and instant visits.
- Chef locks serialize acceptance/activation; payment capture rechecks capacity.
  Early actual completion, overrun, leave and travel gaps affect availability.
- Legacy paid wave timestamps are preserved. Legacy services cannot bypass the
  new safety gates; any existing active legacy paid service needs verified visit
  and menu reconciliation before this stricter release is enabled for it.
- Configurable OpenAI Responses/custom HTTPS menu adapter, structured recipe
  validation, allergy/diet checks and weekly variety against prior dish titles.
- Durable automatic current/next-week jobs anchored to subscription start;
  leases, retry, idempotency, revision snapshots and cooked-recipe preservation.
- Configurable signed face/liveness gateway; client flags cannot prove identity.
- Private immutable video uploads, container/track/duration validation, owner-only
  playback or audited admin access for an open complaint. Default 14-day expiry;
  open complaints preserve retained footage. Purge is performed by the worker.
- Local admin sections for communities, verified chef cuisines/provider enrolment
  references and recording complaints. BMI/body measurements are not sent to chefs.

## Verification completed locally

- All migrations apply in disposable PostgreSQL/PGlite. Existing 44 pricing
  reference entries and previous ownership/payment/RLS checks continue to pass.
- Integration suites cover profiles, menu leases/versions/replanning, reservations,
  combined visits, actual gaps, late captures, session safety, private recording
  ownership/retention and targeted instant arrival-menu confirmation.
- 16 Deno API/provider/scheduling/recording tests pass with mocked providers.
- Native recording-queue tests cover offline footage, interrupted receipts,
  cache-copy recovery, cleanup recovery and owner isolation.
- Mocked browser journeys pass for profile/home/AI-preview/checkout and instant
  cuisine/accept/payment-guard/consent/arrival-dish confirmation. No SMS, AI charge,
  payment or biometric submission is made by these tests.
- Mocked local admin forms for cuisine/identity configuration and complaint
  resolution also pass.
- Admin production build and customer/partner Android, iOS and web bundle exports
  pass. Native camera/background/offline playback still needs physical-device QA.
- Screenshots use synthetic data: menu-preview.png, instant-accepted.png and
  instant-arrival-dishes.png in docs/. The mock menu has only one illustrative day.

## Release dependencies

See [release runbook](RELEASE_V2.md). Hosted health/pricing return HTTP 200;
unauthenticated session, recording and worker access return HTTP 401. The private
recording bucket is configured. The owner approved a dedicated worker credential;
it is in Edge secrets/Vault and the private direct-HTTPS dispatcher runs every
minute. Its private logs show successful HTTP 200 calls while awaiting AI setup.
Client roles cannot invoke the dispatcher or read its logs/Vault.

Remaining external work: AI/payment secrets and real provider tests; the face
verification gateway and identity enrolment; EAS build completion; physical-device
recording/background/offline/OTP/payment/Auth verification. A working adapter or
successful bundle export is not a live provider verification.

The admin stays localhost-only. No new GitHub push has been requested in this
implementation round. Store publication and iOS signing are separate from APK QA.

Full customer-data export was rejected by automatic approval review. A private
schema-only snapshot of the original 24 function definitions was verified before
deployment; no private application-row backup was exported. New legacy purchases
now return an upgrade error; captured historical-order recovery stays available.

## Registration selfie update

The partner app now requires camera-captured registration selfie enrolment after
email confirmation/sign-in. Didit passive liveness checks the initial selfie;
each home visit requires a fresh selfie, passive liveness and a 1:1 match against
the locked reference. The admin can see enrolment status before approving the
chef. Automatic cleanup covers temporary verification photos. DIDIT_API_KEY is
required; the prior generic gateway variables apply to the legacy adapter.

Migration 202611130014, the private selfie bucket and matching API/worker are
deployed. Hosted checks confirm that clients cannot read reference photos or
submit approval results. SQL, mocked provider tests and onboarding/visit screen
walkthroughs pass. Partner Android/iOS/web bundles compile as version 1.2.0.
Real selfie/liveness and physical-device tests remain pending provider setup.
The new partner APK submission timed out, so its cloud build was not confirmed.
AI and Razorpay secret names were verified present during this implementation.

## Registration selfie update

The partner app requires a camera-captured registration selfie after email
confirmation/sign-in. Didit passive liveness checks the initial selfie. Each home
visit requires a fresh selfie, passive liveness and a 1:1 match against the locked
reference. Admin approval and going online require completed selfie enrolment.
Temporary verification photos are removed automatically. Set DIDIT_API_KEY in
Edge secrets. Optional server thresholds default to 50 for face matching and 30
for liveness, following the provider's example settings.

Migration 202611130014, the private selfie bucket and the updated API/worker are
deployed. Clients cannot read reference photos or submit approval results. SQL
integration tests, 19 mocked Edge tests, and onboarding/visit browser walkthroughs
pass. Partner Android/iOS/web bundles compile as version 1.2.0. Real selfie and
liveness tests on physical devices await provider setup. The new partner APK
submission timed out, so its cloud build could not be confirmed. AI and Razorpay
secret names were verified present during this implementation.
