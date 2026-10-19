# Chefos

Chefos uses the supplied navy, white and gold brand kit across an administrator web workspace and separate customer and chef mobile apps.

- **Web:** verified administrators manage customers, chef verification, rate inputs, subscriptions, payments and audit history.
- **Android / iOS:** customer discovery, meal planning, subscription checkout and service status; chef availability, location, instant offers and service codes.
- **Backend:** Supabase Auth, PostgreSQL with row-level security, audited RPCs, and Edge Functions. New quotes read `chefos_pricing_config.json`; paid rates stay locked.
- **Splash:** the supplied React Native animation is available in both mobile variants, with a single animated hat and completion callback.

The hosted Supabase project is connected: all nine migrations and both Edge Functions were deployed on 2026-10-20. Live health, pricing and anonymous-access checks passed. Email, phone and Google Auth are enabled. The initial administrator is activated and has signed in; provider sign-in testing, Razorpay setup and any legacy-data import remain outstanding. See [deployment and migration details](docs/SUPABASE.md).

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

SQL integration tests cover the 44 pricing reference entries, ownership, staff permissions, payment activation, locked rates, instant offers and OTP privacy. Edge tests mock provider/Auth calls. Both customer and chef Android/iOS JavaScript bundles compile; no signed app or live payment was produced.

[Desktop admin preview](docs/chefos-admin.png) ? [Phone admin preview](docs/chefos-admin-mobile.png) ? [Splash test frame](docs/chefos-splash-test.png). Admin screenshots use isolated test data.

Django source is retained for read-only export and rollback; its old setup is archived in [the legacy reference](docs/LEGACY_DJANGO.md).
