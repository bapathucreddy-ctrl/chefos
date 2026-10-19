# Mobile UI reference

The supplied 13-screen reference guides the customer app's warm white surfaces,
navy buttons, gold selection states, photo onboarding, compact chef rows and
booking sequence. The administrator web app remains separate.

Implemented customer flow: animated splash → three onboarding slides → phone or
email sign-in → verification-code entry → name/city details → Home/Search/
Bookings/Profile → chef profile → date/time/household/plan selection → server quote
review → native checkout → verified booking confirmation. The existing weekly
menu and daily service-code screens are available from Profile. Chef partner
registration and operations remain in the dedicated chef app.

The reference's sample prices, reviews, experience counts and FSSAI claims are
not copied into live records. Pricing still uses the root canonical JSON. Real
chef portraits and biographies can be populated in the new `photo_url` and `bio`
columns; missing portraits display a neutral avatar. Discovery supports cuisine
and name search, rating order, and an explicit permission-based 5 km filter.

The booking UI supports recurring daily meals. Custom events and special occasion
services require separate quoting. UPI/card/banking selection happens in the
native Razorpay sheet. Confirmation is shown only after server payment
verification. Existing saved-order recovery remains under Bookings.

Onboarding completion is stored locally. Profile details use an owner-scoped RPC;
user-editable metadata never grants chef verification or admin access. Apply
the customer-details, chef-media and phone-identity migrations along with the
prepared backend before using these screens. Booking date and price-lock checks
use the India service date, including around UTC midnight.

Phone OTP requires enabling the phone provider and configuring an SMS delivery
service in the hosted Supabase project. For email code entry, configure the Auth
Magic Link template with `{{ .Token }}` and a six-digit OTP; default link emails
do not supply the code-entry experience. Outbound messages are sent only when
the user presses the relevant sign-in action. This session did not send messages.
See [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login) and
[email OTP configuration](https://supabase.com/docs/guides/auth/auth-email-passwordless).

Google and Apple buttons now launch Supabase OAuth using the native authentication
browser and validate the returned callback before setting the session. Enable
those providers and configure their credentials and the app redirect URL in the
target project before live use. Chat and calendar integration still require
their own product integrations.
The selected Supabase database and Edge Functions are deployed and live connection
checks passed. Provider setup and account/payment testing remain as described in
[SUPABASE.md](SUPABASE.md).

Onboarding, banners and cuisine cards now use the original PNG photos from the
user-supplied clean asset pack. The original logo is rendered on both mobile and
administrator web surfaces. All source PNGs are preserved unchanged. Reference
chef portraits appear only in the isolated visual preview; live records use
their own approved photos.

[Home preview](reference-home.png) · [Login preview](reference-login.png) ·
[Booking review](reference-review.png). Signed-in previews use isolated mock data.

The current reference splash uses the complete white wordmark and a bottom gold
progress bar. The earlier C/hat animation is retained in `ChefosSplash.js` for
comparison. Current matching assets and source-file gaps are documented in
[REFERENCE_ASSETS.md](../mobile/src/assets/REFERENCE_ASSETS.md). The provided artwork is now bundled; the collage still guides responsive
layout rather than supplying measured Figma constraints.

Validation: the browser flow was exercised with mocked Supabase Auth and API responses, from phone normalization and code entry through details, chef selection and booking review. The browser checkout guard was checked without sending an SMS or charging a payment. Screenshots use fake test records. Real OTP delivery and native checkout require provider setup and a device build.

Asset-pack validation: all eleven bundled PNGs match the supplied source SHA256. Administrator web production build and customer Android/iOS/web exports passed. Mocked browser previews were refreshed after all food and chef images loaded. Exports are compilation checks, not signed device packages.
