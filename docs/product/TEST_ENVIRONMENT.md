# Chefos test and production

Both environments use Supabase project `gvkzgipicojtlzwdnthk` and share Supabase Auth. Test business records are stored in tables ending in `_test`. Test private tables live in `chefos_test_private`. Test RPCs end in `_test`, and the test API is `chefos-api-test`.

The copied tables have independent foreign keys, RLS policies, indexes, triggers and identity sequences. The pricing definition is copied into the test configuration. The initial test data contains 18 synthetic chefs, six around each of Whitefield, Kodigehalli Road near KR Puram, and KR Puram. Their portraits are bundled in the app. Existing administrators can use their normal account to access the test admin workspace.

## Open the test admin app

From `frontend`, run `npm run dev:test`, then open http://127.0.0.1:5175 and sign in with your administrator account. The sidebar says **TEST WORKSPACE**.

Open **Live chef map** and select **Simulate movement**. Only the 18 seeded test chef IDs move. Updates run every five seconds while that screen is open and simulation is enabled. **Pause simulated movement** stops the browser timer. Synthetic pins remain visible when simulation is paused.

## Run the customer and partner test apps

From `mobile`, run `npm run start:test`, `npm run start:chef:test`, or `npm run web:test`. The test web app uses port 8085. Test mode displays a gold banner and uses separate auth/cache keys. Existing Auth users enrol a separate test profile when they sign in.

Test Android builds use `npm run build:apk:test` and `npm run build:apk:chef:test`. Their application IDs end in `.test`, so they can be installed alongside the production apps. The partner build includes background location permissions. Background GPS needs a native build and the phone's background-location permission. Foreground-only sharing is shown explicitly if that permission is declined.

Test deep-link schemes are `chefos-user-test` and `chefos-chef-test`. Add their `://auth/confirm` and `://reset-password` URLs to the shared Supabase Auth redirect allowlist before using email links or Google sign-in in native test builds. Phone OTP and password sign-in use the shared Auth instance.

## Test communities

| Building | Community verification code |
| --- | --- |
| TEST Whitefield Homes | `CHEFOS-TEST-WHITEFIELD-2026` |
| TEST Kodigehalli Road Homes | `CHEFOS-TEST-KODIGEHALLI-2026` |
| TEST KR Puram Homes | `CHEFOS-TEST-KRPURAM-2026` |

These codes are for synthetic test buildings. Choose a flat number when verifying a test home.

## Providers and storage

Test payment calls use `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET` and `RAZORPAY_TEST_WEBHOOK_SECRET`. The key ID must begin with `rzp_test_`. The test webhook is `chefos-payments-webhook-test`. Configure these server secrets when payment testing is needed.

Selfies and recordings use private `chefos-selfies-test` and `chefos-recordings-test` buckets. Test menus use the configured AI provider. Selfie enrolment and cooking identity checks still require the configured liveness/face provider. The existing minutely worker services each environment's separate menu queues and retention records.

The synthetic chefs have no partner login or biometric enrolment. They support discovery, pricing, scheduling and map simulation. Use a registered test partner with a real camera enrolment to verify physical-device journeys and cooking safety flows.

## Reseeding and migrations

The idempotent seed is `supabase/setup/seed_test_chefs.sql`. It changes only the known synthetic chef IDs and test communities. Run it with the Supabase CLI against the linked project. Production chef/customer rows are separate.

The test schema is a snapshot established by migration `202611130017_test_tables.sql`. Future schema and RPC changes should include matching test migrations. Migration `202611130018_test_location_simulation.sql` contains the test-only simulator.
