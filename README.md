# Chefos

Chefos uses the supplied navy, white and gold brand kit across an administrator web workspace and separate customer and chef mobile apps.

The [confirmed product requirements](docs/product/PRODUCT_REQUIREMENTS.md) capture
the owner's latest cuisine-based instant booking, personalised AI menus,
flexible visit scheduling and verified cooking-session workflow. That document
distinguishes the target behavior from features present in the current APKs.
See [implementation progress](docs/product/IMPLEMENTATION_STATUS.md) for the new
profile, scheduling, personalised menus, instant visits and cooking workflow.

- **Web:** verified administrators manage customers, chef verification, rate inputs, subscriptions, payments and audit history.
- **Android / iOS:** customer discovery, meal planning, subscription checkout and service status; chef availability, location, instant offers and service codes.
- **Backend:** Supabase Auth, PostgreSQL with row-level security, audited RPCs, and Edge Functions. New quotes read `chefos_pricing_config.json`; paid rates stay locked.
- **Splash:** the supplied React Native animation is available in both mobile variants, with a single animated hat and completion callback.

The hosted Supabase project is connected with 27 migrations, private selfie and recording storage, and an approved minutely worker. The same project contains 40 copied test tables and 18 synthetic chefs across Whitefield, Kodigehalli Road and KR Puram. See the [test environment setup](docs/product/TEST_ENVIRONMENT.md) for live-map simulation, test apps and shared Auth, and the [release runbook](docs/product/RELEASE_V2.md) for provider and device validation. Email, phone and Google Auth are enabled. The administrator account is activated. See [deployment and migration details](docs/SUPABASE.md).

## Local setup

Copy `frontend/.env.example` and `mobile/.env.example` to `.env` in each directory, then set the project publishable key. Service keys and payment secrets belong only in the server secret manager.

```powershell
cd frontend
npm ci
npm run dev
```

Without a public project key the admin app displays its connection setup state. With a key it requires an active profile with the database role `admin`; customer/chef signup never grants staff access.

```powershell
cd mobile
npm ci
npm run start:user
# Or: npm run start:chef
```

Use an installed native build for Razorpay checkout; Expo Go and browser previews do not include its native payment module. Signed APK/IPA builds require EAS and platform signing access.

See the [mobile UI reference implementation](docs/UI_REFERENCE.md) for onboarding, OTP, chef profiles and booking review.

## Validation

```powershell
cd supabase
npm ci
npm test
npm run check
npm run test:edge
```

SQL integration tests cover the 44 pricing reference entries, ownership, staff permissions, payment activation, locked rates, instant offers and OTP privacy. Edge tests mock provider/Auth calls. Both customer and chef Android/iOS JavaScript bundles compile. The November release also has recording-queue recovery tests and mocked browser walkthroughs; see the implementation progress and release runbook for hosted/APK status. No live payment was made by these tests.

[Desktop admin preview](docs/chefos-admin.png) ? [Phone admin preview](docs/chefos-admin-mobile.png) ? [Splash test frame](docs/chefos-splash-test.png). Admin screenshots use isolated test data.

Django source is retained for read-only export and rollback; its old setup is archived in [the legacy reference](docs/LEGACY_DJANGO.md).
