# Legacy Django reference

Archived setup instructions for source export and rollback. The active app entry points use Supabase; see SUPABASE.md.

# Chefos

Chefos is a full-stack platform that connects customers with chefs for recurring meal subscriptions and on-demand cooking services. Customers can discover chefs, configure meal preferences, generate weekly menus, schedule meals, pay for subscriptions, and follow service progress. Chef partners use a separate workflow to manage availability, location, assignments, and the complete service journey.

This repository contains a Django REST API, a React web application, and an Expo React Native application that can run in customer or chef-partner mode.

## What the Application Does

### Customer experience

- Create an account and sign in with JWT authentication.
- Browse available chefs, view profiles, and find nearby chefs.
- Request a chef immediately or assign one to a subscription.
- Set cuisine, diet, meal, and menu preferences.
- Generate an AI-assisted weekly menu.
- View the weekly menu and today's meal schedule.
- Preview subscription pricing and create a payment order.
- Track active subscriptions and service status.
- View instant-chef order history and submit feedback.

### Chef-partner experience

- Register and sign in through a dedicated chef flow.
- Manage availability and working slots.
- Update the chef's current location.
- View assigned and nearby instant-service requests.
- Accept or reject instant chef requests.
- Handle service start verification, journey status, and completion.
- Review service history from the chef dashboard.

### Operations and integrations

- Django Admin for internal data management.
- AI menu generation through OpenRouter, OpenAI, DeepSeek, or Gemini.
- Cuisine search through SerpAPI when configured.
- Subscription payment order creation and verification through Razorpay.
- WhiteNoise static-file serving in production.
- SQLite for local development and optional MySQL for production.

## Technology Stack

| Area | Technology |
| --- | --- |
| Backend | Python, Django, Django REST Framework |
| Authentication | Simple JWT access and refresh tokens |
| Web | React 19, Vite, React Router, Axios |
| Maps | Leaflet and React Leaflet |
| Mobile | Expo 53, React Native, React Navigation |
| Database | SQLite locally, MySQL when configured |
| Production server | Gunicorn and WhiteNoise |
| External services | AI providers, SerpAPI, Razorpay |

## Repository Structure

```text
Chefos/
├── backend/                  Django project and REST API
│   ├── chef/                 Chef discovery, assignment, and partner workflows
│   ├── config/               Settings, URLs, WSGI, and ASGI
│   ├── core/                 Subscriptions, menus, scheduling, payments, and AI
│   ├── menu/                 Menu domain app
│   ├── users/                Custom user model and user logic
│   ├── manage.py
│   └── requirements.txt
├── frontend/                 React and Vite web application
│   └── src/
│       ├── components/       Shared UI and authentication components
│       ├── pages/            Customer and chef-partner pages
│       ├── routes/           Protected route handling
│       └── services/         API client and authentication sessions
├── mobile/                   Expo React Native application
│   └── src/                  Screens, navigation, API client, and app logic
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- npm
- Git
- Expo Go, an Android emulator, or an iOS simulator for mobile development

Optional requirements include MySQL, an AI provider API key, a SerpAPI key, Razorpay credentials, and an Expo/EAS account for native builds.

## Quick Start

Run the backend, frontend, and mobile app in separate terminals.

### 1. Clone the repository

```bash
git clone https://github.com/bapathucreddy-ctrl/chefos.git
cd chefos
```

If the project is already on your computer, open a terminal in the `Chefos` directory instead.

### 2. Configure and run the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

On Windows PowerShell, activate the environment with:

```powershell
.venv\Scripts\Activate.ps1
```

The API runs at `http://127.0.0.1:8000/api/` and Django Admin at `http://127.0.0.1:8000/admin/`.

Create an administrator account when needed:

```bash
python manage.py createsuperuser
```

### 3. Configure and run the web application

Open another terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/
```

Start Vite:

```bash
npm run dev
```

Open the URL shown by Vite, normally `http://localhost:5173`.

To expose the web app to other devices on the same network, use `npm run dev:lan`.

### 4. Configure and run the mobile application

The Django server and phone must be on the same network. Find the computer's LAN IP, such as `192.168.1.10`, and run Django on all interfaces:

```bash
cd backend
source .venv/bin/activate
python manage.py runserver 0.0.0.0:8000
```

In another terminal:

```bash
cd mobile
npm install
```

Create `mobile/.env` with the computer's LAN IP. Do not use `localhost` when testing on a physical phone.

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000/api/
```

Start the customer app:

```bash
npm run start:user
```

Or start the chef-partner app:

```bash
npm run start:chef
```

Scan the QR code with Expo Go or choose an installed emulator from the Expo terminal.

## Backend Configuration

Copy `backend/.env.example` to `backend/.env`. Local development works with SQLite and without external service keys.

### Core settings

| Variable | Purpose | Local example |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django signing secret | A long random string |
| `DEBUG` | Development behavior | `True` |
| `ALLOWED_HOSTS` | Comma-separated backend hosts | `*` locally |
| `CORS_ALLOWED_ORIGINS` | Origins allowed to call the API | `http://localhost:5173` |
| `CSRF_TRUSTED_ORIGINS` | Trusted browser origins | `http://localhost:5173` |
| `API_CACHE_TTL_SHORT` | Short cache lifetime in seconds | `60` |
| `API_CACHE_TTL_MEDIUM` | Medium cache lifetime in seconds | `300` |

Development mode permits local network access to simplify mobile testing. Configure exact hosts and origins before deploying.

### Database

Leave the database variables empty to use `backend/db.sqlite3`. Set them to use MySQL:

```env
DB_NAME=chefos
DB_USER=chefos_user
DB_PASSWORD=your-database-password
DB_HOST=127.0.0.1
DB_PORT=3306
```

Run `python manage.py migrate` after changing databases or pulling new migrations.

### AI menu generation

Choose one provider and configure its key. OpenRouter is the default:

```env
AI_PROVIDER=openrouter
AI_STRICT_MODE=False
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=deepseek/deepseek-v3.2
```

Other supported provider variables:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

### Search and payments

```env
SERPAPI_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

Without Razorpay credentials, the complete production payment flow is unavailable. Native Razorpay checkout still needs to be integrated into the mobile client; the current mobile subscription flow creates the backend payment order.

Never commit real API keys or a local `.env` file.

## Authentication

Chefos uses JWT bearer authentication:

- Login returns access and refresh tokens.
- Requests send `Authorization: Bearer <token>`.
- Access tokens last one day and refresh tokens last seven days by default.
- The web client automatically attempts to refresh an expired access token.
- Customer and chef sessions are stored separately, and protected routes verify the active role.

Main authentication endpoints:

```text
POST /api/register/
POST /api/token/
POST /api/token/refresh/
POST /api/chefs/partner/register/
GET  /api/chefs/partner/me/
```

## Main API Areas

| Area | Example endpoints |
| --- | --- |
| Health | `GET /api/health/` |
| Chefs | `GET /api/chefs/`, `POST /api/chefs/assign/` |
| Instant service | `/api/chefs/instant/request/` |
| Chef partner | `/api/chefs/partner/availability/`, `/api/chefs/partner/location/` |
| Menus | `/api/menu/weekly/`, `/api/menu/today/`, `/api/menu/generate/` |
| Preferences | `/api/menu/preference/`, `/api/cuisines/search/` |
| Subscriptions | `/api/subscriptions/create/`, `/api/subscription/active/` |
| Scheduling | `/api/scheduling/capacity-check/` |
| Payments | `/api/payments/create-order/`, `/api/payments/verify/` |
| Feedback/history | `/api/feedback/`, `/api/chefs/history/instant/` |

Protected endpoints require a valid JWT access token. See `backend/core/urls.py` and `backend/chef/urls.py` for the complete route list.

## Typical User Flow

1. A customer creates an account and signs in.
2. The customer selects meal and cuisine preferences.
3. Chefos generates or displays a weekly menu.
4. The customer checks scheduling capacity and chooses a subscription.
5. The backend previews the price and creates a payment order.
6. A chef is assigned, or the customer creates an instant chef request.
7. The chef accepts the work, verifies service start, and updates journey status.
8. The service is completed and the customer can submit feedback.

## Development Commands

### Backend

```bash
cd backend
source .venv/bin/activate
python manage.py runserver       # start the API
python manage.py makemigrations  # create model migrations
python manage.py migrate         # apply migrations
python manage.py test            # run backend tests
```

### Web

```bash
cd frontend
npm run dev       # local development server
npm run dev:lan   # server available on the LAN
npm run lint      # ESLint checks
npm run build     # production bundle
npm run preview   # preview the production bundle
```

### Mobile

```bash
cd mobile
npm run start:user       # customer Expo app
npm run start:chef       # chef-partner Expo app
npm run android:user     # customer Android native run
npm run android:chef     # chef Android native run
npm run ios:user         # customer iOS native run
npm run ios:chef         # chef iOS native run
npm run build:apk        # customer Android preview APK
npm run build:apk:chef   # chef Android preview APK
npm run build:aab        # customer production Android bundle
```

Native commands require the matching Android or iOS toolchain. EAS builds require Expo authentication and valid EAS configuration.

## Production Deployment

### Backend

The included build script installs dependencies, collects static files, and runs migrations:

```bash
cd backend
./build.sh
```

Start the production server with:

```bash
gunicorn config.wsgi:application
```

Set `DEBUG=False`, use a strong secret, configure exact hosts and origins, provide a persistent database, and keep HTTPS security settings enabled. The health check is `GET /api/health/`.

See [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md) and [backend/render.yaml](backend/render.yaml) for the existing deployment configuration.

### Web

Set the deployed API URL before building:

```env
VITE_API_BASE_URL=https://your-api-domain.example/api/
```

Then build:

```bash
cd frontend
npm install
npm run build
```

Deploy `frontend/dist/` to a static host. Configure unknown browser paths to serve `index.html` because the app uses client-side routing.

## Troubleshooting

### The web app cannot reach the API

- Confirm Django is running on port `8000`.
- Confirm `VITE_API_BASE_URL` ends with `/api/`.
- Restart Vite after changing `frontend/.env`.
- Add the web app's exact origin to production CORS and CSRF settings.

### A phone cannot reach Django

- Use the computer's LAN IP, not `localhost` or `127.0.0.1`.
- Run Django with `python manage.py runserver 0.0.0.0:8000`.
- Keep the phone and computer on the same network.
- Allow port `8000` through the firewall if required.
- Restart Expo after changing `mobile/.env`.

### Database errors after pulling changes

Activate the backend virtual environment and run `python manage.py migrate`.

### AI menu generation does not work

- Verify that `AI_PROVIDER` names a supported provider.
- Verify its API key and model variables.
- Check the Django terminal for the provider error.
- Keep `AI_STRICT_MODE=False` to permit configured fallback behavior.

### Authentication returns `401 Unauthorized`

- Sign in again if both tokens expired.
- Confirm the request includes a bearer access token.
- Confirm the account role matches the protected customer or chef route.

## Git and Security Notes

- Do not commit `.env` files, API keys, database passwords, or payment secrets.
- Do not commit `node_modules`, virtual environments, builds, static files, caches, or the local SQLite database.
- Run backend tests and frontend lint/build checks before pushing significant changes.
- Commit migrations whenever Django models change.

## Current Scope

Chefos provides the application and API flows for customer subscriptions, chef-partner operations, menu planning, scheduling, and payment order handling. A production deployment still requires real service credentials, strict host/origin configuration, a persistent database, and platform-specific payment checkout where applicable.
