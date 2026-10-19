# Chefos Android and iOS

Customer and chef partner variants share Expo/React Native components and use Supabase Auth and the Chefos Edge API. The browser product is a separate admin workspace.

Copy `.env.example` to `.env` and set the Supabase public publishable key, then run:

```powershell
npm ci
npm run start:user
# Or: npm run start:chef
```

After setting or changing a public project key, use `npm run start:user -- --clear`
(or the chef variant) to clear Metro's cached environment values before testing.

`npm run build:apk` and `build:apk:chef` select Android preview builds; `build:aab`, `build:aab:chef`, `build:ios` and `build:ios:chef` select production EAS builds. Signing access and EAS login are required.

The supplied splash is implemented in `src/components/ChefosSplash.js`, including reduced-motion handling and a single animated hat. It calls `onFinish` to open authentication.

Razorpay checkout requires an installed development or release app. Expo Go and browser previews cannot use that native payment module. Service and payment calls require the deployed Supabase backend and its configured server secrets.

See [Supabase deployment and cutover](../docs/SUPABASE.md) for current status, Auth redirects, pricing, permissions and remaining live verification. No production data or hosted Auth users have been migrated yet.

Android APK profiles: `preview` builds the customer app and `preview-chef` builds the partner app, using Node 22.16 and the Expo preview public connection variables. Both use the same EAS project with separate Android package IDs. The admin web app remains on localhost.
