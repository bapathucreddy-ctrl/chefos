# Supplied Chefos assets

Source: `C:/Users/Admin/Downloads/chefos_clean_asset_pack`.
All eleven PNG files are copied unchanged into `reference/`.
The original `logo.png` is used by the native wordmark and administrator web UI.
An SVG viewport crops its surrounding navy space at render time; the source
pixels and logo contours are preserved. A render-time mask supplies white or
navy ink for the appropriate background.

| Screen | Supplied file |
| --- | --- |
| Splash, login, headers | logo.png |
| Onboarding 1 and home banner | banner_01_curry_hero_banner.png |
| Onboarding 2 | chef_04_female_chef_garnishing_food.png |
| Onboarding 3 | banner_02_closeup_garnishing_plated_curry.png |
| Cuisine cards | food_01 through food_05 |
| Preview chef profile | chef_04_female_chef_garnishing_food.png |

Chef portraits are available for visual previews. Live records retain their own
`photo_url`; reference models are not assigned to actual chefs automatically.
The pack has no Chinese dish, so the supplied fish meal is labelled Coastal and
biryani is labelled Biryani. No substitute photo is labelled Chinese.

The UI follows the supplied collage with Inter text, serif onboarding headings,
navy #071B31, gold #FFB719 and warm white #FAF9F6. The screenshot collage is still
a visual guide rather than a measured Figma specification; responsive crops and
live pricing can differ from its example content.
