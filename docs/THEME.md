# Chefos application theme

The web and Expo applications use the supplied brand kit: navy **#14213D**, white **#FFFFFF**, and gold **#F2B134**, with rounded Nunito Sans typography. The rounded Chefos wordmark and chef hat follow the supplied logo; no gold punctuation is added to it. Gold is used for actions and splash accents. Primary white-on-navy, secondary navy-on-white, and monochrome logo rendering use one shared web component, and the C-and-hat symbol is used for the app icon.

## Run locally

Web: run `npm install` and `npm run dev` from `frontend`, then visit the URL printed by Vite.

Mobile: run `npm install` from `mobile`, then `npm run start:user` or `npm run start:chef`. These launchers work in Windows PowerShell as well as macOS and Linux. Use `npm run web` for the Expo browser version. Android/iOS testing requires Expo Go or the corresponding native toolchain.

Run the Django API separately using the existing root README instructions. Set `VITE_API_BASE_URL` for the web client and `EXPO_PUBLIC_API_BASE_URL` for mobile. On a physical phone, use the computer's LAN address instead of localhost.

## Included

- Animated C, falling chef hat, wordmark reveal, and gold splash rings.
- Responsive meal catalogue with search, categories, vegetarian filter, sorting, meal details, and favourites.
- Weekly meal planner with day/meal selection, replacement, removal, and device persistence.
- Shared account screens, branded navigation, customer and chef partner flows, and consistent mobile theme tokens.
- Local food photography, logo asset, keyboard-accessible web dialogs, and reduced-motion support.

The discovery dishes and ratings are sample menu inspiration. Service prices now come from the canonical Chefos pricing configuration through the backend; see [PRICING.md](PRICING.md). Favourites and the discovery planner are saved locally; adding a meal does not place an order or create a subscription. Account, chef discovery/assignment, AI menus, scheduling, payments and partner operations use Django integrations. Real transactions require the backend and service credentials; native payment checkout remains subject to the limitations documented in the root README.

## Brand assets

The project assets are `frontend/public/brand/chefos-logo.png` and `mobile/src/assets/chefos-wordmark.png`, with `chefos-app-icon.png` alongside each. They were prepared using the built-in image tool from the supplied logo reference. The final wordmark prompt requested the white rounded **Chefos** lettering, a three-lobed chef hat over the C, a navy background, and no punctuation, texture, or extra elements. The icon prompt requested only the white C-and-hat symbol with clear space on navy. Shared web and mobile components render the wordmark through an SVG colour filter for both light and dark surfaces.

Local meal photography comes from the six Unsplash image IDs retained in the filenames under `frontend/public/meals`.

## Validation

- Vite production build passed.
- Expo web export passed; all mobile JavaScript files parsed successfully.
- Chrome checks exercised search, favourites, vegetarian filtering, adding meals, weekly planner, account form labels, image loading, and desktop/phone layout overflow. No page exceptions occurred.
- Expo browser checks verified splash-to-login rendering and empty-form validation without runtime exceptions.
- ESLint results were compared with the original repository: the same 14 errors and 5 warnings remain in existing files, with no additional findings from the new components.

Native Android/iOS builds and live backend/payment transactions have not been exercised in this environment. Preview images are stored beside this document.

## Final asset prompts

Built-in image tool, opaque PNG output; files were copied into the project paths above.

Wordmark: “Create a pristine clean version of the uploaded Chefos white logo on a perfectly flat solid dark navy blue (#0c1e38) background, wide 3:1 horizontal logo asset. Exact text 'Chefos', capital C lowercase hefos, no punctuation or dot. Bold smooth rounded geometric lettering, white chef hat with three round lobes tilted slightly counterclockwise over the C. Preserve the user's original logo design and close spacing, large C with curved gap below chef hat. Pure white solid letter fills, crisp smooth edges. NO TRANSPARENCY. Background must be fully opaque flat uniform navy with no texture, grunge, splatters, noise, highlights, shadows, gradients or details. White logo fills most of width with 5% margins. This is clean digital brand artwork.” The navy backing is removed when the logo renders, and all application theme colours follow the subsequently supplied kit.

App icon: “Create the app icon from this Chefos logo. Use ONLY the same uppercase rounded white C and the same white puffy chef hat angled above it, omit 'hefos'. Square opaque icon with fully solid navy #14213D background all the way to the square image edges (OS will apply corner rounding), no white margins. White C-and-chef-hat symbol centered, comfortably contained in the central 64 percent of the square with generous clear space. Preserve reference symbol shape closely. Clean smooth solid fills with no gradients, textures, shadows, noise, text, gold dot or extra details. 1024 by 1024 PNG.”
