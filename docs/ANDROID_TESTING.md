# Android verification builds

The administrator web app runs locally at http://localhost:5173. Android apps
connect directly to the hosted Supabase backend; they do not need the admin
computer or a Metro development server to be running.

| App | Build profile | Android package |
| --- | --- | --- |
| Chefos Customer | preview | com.chiketan.chefosuser |
| Chefos Partner | preview-chef | com.chiketan.chefospartner |

Both APKs can be installed on the same phone. These are signed internal preview
builds, not Play Store submissions. Keep the existing signing credentials for
future updates.

## Verify on your phone

1. Install each APK, allowing installation from the browser or file manager when
   Android requests it.
2. In Customer, check the splash, three onboarding screens, original logo and
   food imagery. Try phone OTP and Google sign-in, then save your name and city.
3. Use a customer identity separate from the administrator email. Each account
   has one application role; the admin identity belongs in the local web app.
4. Register a separate chef identity in Partner and confirm its email. In the
   local admin app, review and verify that chef, configure its rates and available
   service slots, then enable availability. No fictitious chefs are seeded into
   the live database.
5. In Customer, find the available chef, inspect the profile and review a quote.
   Prices come from the deployed JSON configuration.
6. Close and reopen both apps to check session persistence. Check back navigation,
   location permissions, small-screen layout and sign-out.
7. Report the app name, screen, steps and screenshot for any failure.

Payment activation still requires Razorpay credentials and provider webhook
registration. Phone/Google are enabled, but delivery and redirect behavior need
the device checks above. The Partner app currently uses email/password sign-in.

## Build configuration

The two profiles explicitly set APP_VARIANT on the remote worker. They use Node
22.16 and the Expo preview environment's public Supabase URL/publishable key.
Local env files, admin setup credentials, local tools and backend source are
excluded from the uploaded build archive. EAS includes its managed Git metadata.

Use `npm run build:apk` and `npm run build:apk:chef` from `mobile` to rebuild.

## Generated artifacts

Both preview builds finished successfully. Local installers are under ignored
`build/`, with SHA256SUMS.txt and apk-manifest.json for integrity and build IDs.
Customer build: 89e76b08-9a93-4fe0-90be-1da9cff5b25d.
Partner build: dc0083cd-f454-453e-96de-a1824d4a2a0f.
These APKs have not yet been exercised on a physical Android phone.
