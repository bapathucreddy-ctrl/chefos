# Chefos pricing definition

The single source is [chefos_pricing_config.json](../chefos_pricing_config.json). The backend reads this file directly, with changes detected by its modification time. Keep it in the repository root when deploying, or set `CHEFOS_PRICING_CONFIG_PATH` to the deployed file's absolute path. No copy of the private rate card is shipped in the frontend bundle.

The temporary ₹2 backend override, old web price tables, and dish-specific sample prices have been removed. Displayed service prices are per **home per meal**, before GST. No GST amount is invented or added. The JSON still labels these rates as pilot estimates.

## Rates and calculation

The backend uses Decimal arithmetic and half-up rounding. It calculates the chef's base payout plus the highest eligible bonus in each category, then applies the payout cap. All rating prerequisites must be satisfied. Household scaling changes both price and payout, with the base band left unrounded. Weekly/monthly/quarterly plans use the file's 7/30/90-day definitions. Billing end dates are inclusive, so a monthly subscription covers exactly 30 service dates.

MEAL2 and MEAL3 apply automatically for the corresponding number of meals. Their scaled discounts are clamped to the price floor and never change chef payout. Explicit promotional coupons replace the automatic bundle rather than stacking with it. A household of 9 or more requires a custom quote.

For a base chef and 3–4 people:

| Plan | Meals/day | Per meal | Upfront total |
| --- | ---: | ---: | ---: |
| Weekly | 1 | ₹165 | ₹1,155 |
| Monthly | 1 | ₹143 | ₹4,290 |
| Monthly | 2 | ₹140 | ₹8,400 |
| Monthly | 3 | ₹135 | ₹12,150 |
| Quarterly | 1 | ₹137 | ₹12,330 |

Instant quotes are ₹250 for one meal or ₹450 for two at the base household/chef rate. Two-meal quotes require both slots to be available for the same home and day. The existing instant-service workflow still books one meal at a time; the new quote endpoint does not itself book, charge, or confirm two slots.

## API and checkout

- `GET /api/pricing/`: public customer-only catalogue, with household/plan/bundle and instant quotes.
- `GET /api/subscriptions/price-preview/?meal_type=lunch,dinner&plan_cycle=monthly&people_count=3&chef=ID`: authoritative quote for the selected chef, including plan days and applied meal coupon.
- `GET /api/pricing/instant-preview/?meal_count=2&people_count=3&chef=ID`: authenticated instant quote and slot-confirmation requirement.
- Existing payment-order creation uses the same calculator and saves the complete quote privately on the transaction.
- Subscription activation requires `payment_order_id` for a verified, unconsumed payment. The paid quote's household, cycle, chef, meals and amount must match. Client-submitted rates cannot override it.

Checkout snapshots preserve the paid price and chef payout if the rate card changes before activation. Existing plans keep their price until renewal; household/cycle changes and billing-date extensions are rejected mid-plan. A switch to a differently priced chef requires a remaining-meal adjustment workflow rather than a silent free change. Legacy plans without a snapshot retain their stored total and do not acquire an invented payout.

Customer APIs hide chef payouts, floor inputs and platform fees. The chef earnings calculation uses the saved payout for new subscriptions, rather than dividing the customer payment. The web catalogue's plan selector fetches public rates, and checkout has no guessed-price fallback: an unavailable quote blocks confirmation. Mobile uses the same server quotes and respects locked subscription prices.

## Operations and rollout

Apply the schema update before running the new backend:

```sh
cd backend
python manage.py migrate
```

`ChefPricingProfile` in Django Admin holds verified subscriber-rating count, tenure, completed-meal count and specialty certification. Operations should review these inputs monthly. A chef without verified pricing inputs uses the base payout. A specialty string alone does not earn the certified-specialty bonus. An agreed pilot-cook rate and start date can also be maintained there; the special markups expire after the configured six months, and coupons/bundles are disabled for those rates. This change does not add a ratings-verification pipeline or monthly payroll scheduler.

Welcome promotions in the supplied file have no expiry dates even though `coupon_rules.expiry_required` is true. They are therefore rejected until operations configures an `expires_at` ISO date on the promotion. Expired, wrong-plan, ineligible and below-floor promotions are rejected. Referral credits require a verified credit ledger and are not granted merely by entering a code. Device/phone/flat limits, the shared promotional budget, refund processing, tax treatment and payroll transfers remain separate operational integrations; they are not implied by a price quote.

## Verification

```sh
cd backend
python manage.py test core chef menu users
python manage.py makemigrations --check --dry-run
```

The pricing suite compares all 36 subscription entries and 8 instant entries against the JSON reference tables, plus total vectors, half-up boundaries, bonus prerequisites/caps, floors, pilot rates, coupon restrictions, formula changes, API privacy, gateway amounts, paid-price locks, legacy plans, invalid input and payment reuse. Browser checks exercise the actual pricing API, household/plan/meal selectors and phone layout. Payment-gateway calls in tests are mocked; no real payment is created.
