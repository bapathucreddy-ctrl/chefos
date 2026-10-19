# Chefos Supabase cutover

Target: [gvkzgipicojtlzwdnthk](https://supabase.com/dashboard/project/gvkzgipicojtlzwdnthk).

The code now uses Supabase Auth, database RPCs and Edge Functions. The browser
entry point is an administrator workspace; customer and chef accounts use the
separate Expo variants on Android and iOS. Django remains in the repository for
source data export and rollback. It is not called by the current app entry points.

**Deployment status (2026-10-20):** connected to the hosted project. All nine
migrations are applied and both `chefos-api` and `chefos-payments-webhook` are
deployed. Public keys are configured locally for mobile and admin web; rebuilt
customer/partner Android, iOS and web bundles and the administrator web build
include the connection settings.

Live smoke checks passed: API health, public pricing, allowed localhost CORS,
and anonymous rejection from protected chef discovery. Database checks confirm
nine migration records, pricing version `1.0.0-pilot`, and RLS on all business
tables. Before deployment the project had zero Auth users and no public tables;
the connection checks created no accounts, messages or payments. A subsequent
owner-requested initial administrator has been provisioned with an audited
UUID-scoped role grant. Its activation link and initial password are saved only
in an ignored local setup file. Owner activation and a successful sign-in were
verified afterward; the account remains active with the admin role.
A schema dump could not run without Docker; the empty-project inspection and
smoke result are recorded under ignored `supabase/backups/`.

Email, phone and Google Auth are enabled; Apple remains disabled. Provider
enablement is verified, but real SMS delivery and Google sign-in still need
end-to-end checks. Razorpay secrets/webhook registration, mobile Auth redirect configuration, any legacy data import,
and live end-to-end account/payment testing remain outstanding. Both signed Android preview APKs are generated and downloaded under ignored
`build/`: `chefos-customer-1.0.0.apk` and `chefos-partner-1.0.0.apk`. Archive
integrity, distinct package IDs, signing-block presence and embedded Supabase
backend URLs were checked. Physical-device verification remains with the owner. No signed IPA was produced.
The administrator site is intentionally local-only at the owner's request;
public admin hosting is outside the release scope.

## Deploy the prepared backend

1. Connect the Supabase integration to the target project, inspect its existing
   tables and functions, and take a backup. All new tables use `chefos_` names;
   private business records use `chefos_private`. Existing unrelated tables must
   not be replaced. Use a staging branch first when existing users are present.
2. With the Supabase CLI authenticated, run from the repository root:

   ```powershell
   supabase link --project-ref gvkzgipicojtlzwdnthk
   supabase db push --dry-run
   supabase db push
   supabase functions deploy chefos-api --project-ref gvkzgipicojtlzwdnthk
   supabase functions deploy chefos-payments-webhook --project-ref gvkzgipicojtlzwdnthk
   ```

3. Set Razorpay credentials and webhook secret through the project's secure
   secret manager. The names are in `supabase/.env.example`. Set
   `CHEFOS_ALLOWED_ORIGINS` to the exact production admin origin. Service-role
   credentials belong only in server secrets; client `.env` files contain the
   public publishable key. Supabase supplies its server URL and keys to functions.
4. Configure Auth email/password login, eight-character minimum passwords,
   email confirmation and the exact redirects from `supabase/config.toml`:
   `chefos-user://auth/confirm`, `chefos-chef://auth/confirm`,
   `chefos-user://reset-password`, `chefos-chef://reset-password`.
   CLI local Auth config does not update hosted Auth settings automatically.
   Configure the actual admin HTTPS site URL and outbound email delivery.
5. Create the initial administrator in Auth, verify its identity, then explicitly
   grant its UUID the `admin` role in `public.chefos_profiles` using the SQL
   editor. Signup metadata cannot grant this role. Do not promote accounts by a
   broad email-domain match. All subsequent app access requires an active profile.
6. Copy `frontend/.env.example` and `mobile/.env.example` to `.env` in their
   respective directories. Add the target project's **public publishable key**,
   build again, and deploy the admin `frontend/dist` with SPA route fallback.
7. Configure the Razorpay webhook URL
   `https://gvkzgipicojtlzwdnthk.supabase.co/functions/v1/chefos-payments-webhook`
   for `payment.captured`. Verify a test-mode payment, delayed webhook, retry and
   slot-conflict refund/reassignment procedure before switching payment modes.

## Existing Django records and accounts

Use the real source database settings for the read-only export:

```powershell
cd backend
python manage.py export_supabase --output ../supabase/backups/source.json
cd ../supabase
node scripts/inspect-export.mjs backups/source.json backups/preflight.json
```

The export takes a database snapshot transaction and excludes password hashes,
payment signatures and live start/end OTP codes. It preserves source IDs and
includes profiles, preferences, menus, pricing metrics, subscriptions, payments,
assignments, wave policies, instant requests, service history and feedback.
Exports contain personal data and the backup directory is ignored by Git.
Existing backup/report files are never overwritten.

The preflight produces counts, a SHA-256 digest, an explicit identity mapping
template, and review items for missing/duplicate emails, privileged accounts,
duplicate active plans, missing price snapshots and in-flight service. It is
read-only and always reports `ready_for_cutover: false`: it does not pretend an
export is an import or create hosted accounts.

The final data import must be prepared against the inspected source export and
target Auth identities. Do not copy Django's PBKDF2 password field into Supabase
Auth or accept a client-supplied old numeric user ID. Establish a verified mapping
from every legacy ID to a Supabase Auth UUID, resolve missing/duplicate emails,
and arrange password recovery. No invitation or password-reset messages were
sent during this work. The mobile app supports email recovery and deep links.

Preserve paid totals and saved private payouts exactly, including legacy prices;
never recalculate a historic plan from today's rate card. Reconcile record counts,
money totals, role grants, ownership and ongoing services before stopping Django
writes or switching production clients. The source export and target data have
not yet been inspected, so a final import cannot safely be generated or run here.

## Permissions and business rules

- Auth users read their own profiles. Active customers read their own plans,
  menus, assignments and feedback. No client has direct table-write privileges.
- Chef accounts start unverified and unavailable; only admins can verify them or
  change their rate metrics. Exact coordinates and service codes remain private.
- Administrators manage customers, chefs and paid-plan availability through
  audited RPCs. They cannot manually mark payments paid or edit paid plan prices.
- Pricing comes from the canonical root `chefos_pricing_config.json`, seeded into
  a private configuration table. Public quotes remove chef payouts and price
  floors. Paid quotes and private payouts are frozen on activation.
- Server-only payment functions are granted to `service_role`, not authenticated
  clients. Order creation ignores client price fields; verification checks HMAC,
  provider capture, order identity, amount, currency and account ownership.
  Activation is idempotent, locks customer/chef rows and checks meal-slot capacity.
- Webhooks only record signed captures; the account-scoped activation RPC retries
  the saved booking. A captured order that loses its slot needs support and a
  refund or reassignment; it must not be charged again.
- Codes expire in ten minutes and permit five attempts. Incorrect attempts commit
  their counter without advancing service; codes are returned only to the owner.
- Default MEAL2/MEAL3 discounts work. Promotional coupons are rejected until expiry
  and eligibility are configured; referral and loyalty credit ledgers, automatic
  refunds and payroll settlement are not implemented by these migrations.
- Menu generation currently uses a labelled curated vegetarian starter plan,
  without an external AI provider. Allergy/restriction entries require chef review
  and block automatic generation. Do not treat this as clinical meal planning.

## Pricing updates

Before the initial deployment, `npm run pricing:sync` in `supabase` regenerates the
seed migration from the JSON. After that migration has been applied, create a
**new timestamped migration** containing the new upsert; never rewrite an applied
migration. Re-run the reference and locked-price tests with any pricing change.

## Local checks

```powershell
cd supabase
npm ci
npm test
npm run check
npm run test:edge
cd ../frontend
npm run build
```

The SQL suite runs actual PostgreSQL/PLpgSQL in PGlite with Auth role stubs. It
checks all 44 canonical pricing entries, RLS isolation, role escalation, staff
sections, instant acceptance, household ownership, OTP attempts/privacy, payment
activation and replay, immutable paid quotes and suspended accounts. This is
local integration coverage; it does not substitute for hosted Auth, SMTP,
Razorpay or concurrent production-load tests. Edge tests mock external services.

Browser checks used fake data generated by the SQL suite, with mocked Supabase
requests. Screenshots `chefos-admin.png` and `chefos-admin-mobile.png` show this
test data, not the hosted project's records. The disconnected app displays a
setup state and disables sign-in until its public key is configured.

## Android and iOS builds

From `mobile`, `npm run start:user` and `npm run start:chef` select the app variant.
`npm run build:apk` / `build:apk:chef` create Android preview builds;
`build:aab` / `build:aab:chef` and `build:ios` / `build:ios:chef` select production
builds through EAS. The wrapper works in PowerShell. Signed builds require the
project's EAS and Apple/Google signing access, which was not used here.

Customer bundle IDs are `com.chiketan.chefosuser`; chef bundle IDs are
`com.chiketan.chefospartner`. Both platforms use the original supplied wordmark with the reference loading
bar splash. `ChefosSplash.js` retains the earlier C/hat animation for comparison.
Reduced-motion preferences shorten the loading animation.

Razorpay requires an installed native development/release build; Expo Go and the
browser preview cannot run native checkout. Android/iOS JavaScript bundle exports were validated and both Android preview
APKs are available. No signed IPA or physical-device payment test was produced.

Official references: [React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Edge authentication](https://supabase.com/docs/guides/functions/auth),
[Razorpay React Native iOS](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/build-integration-ios/).
