# Chefos Admin

React/Vite operations workspace using Supabase Auth and audited database RPCs. Customer and chef workflows run in the mobile apps.

```powershell
npm ci
# Copy .env.example to .env and configure the public project key.
npm run dev
npm run build
```

Sign-in requires an active `admin` role in `chefos_profiles`. Signup metadata cannot grant it. Without a project key, the app displays its connection setup state.

See [deployment and migration status](../docs/SUPABASE.md). Configure SPA route fallback when hosting `dist`.
