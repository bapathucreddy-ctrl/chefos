# Chefos — Product, Pricing & Build Spec (v1.0 pilot)

> Single-file spec for Claude Code. Date: 2026-10-19. Currency: INR. All amounts are **before GST**.
> The full machine-readable pricing config is embedded in **Appendix A**. Treat Appendix A as the source of truth for numbers; this document explains how to use them.
> All numbers are pilot estimates. Do not hardcode prices — load them from config.

## 0. How to use this file (instructions for Claude Code)

1. The app is nearly built. **First read the existing codebase**, then compare it with this spec and list gaps before changing anything.
2. Known missing pieces: the **pricing engine** and the **session recording flow**. Build these first.
3. Implement pricing as **pure, unit-tested functions** that read the config (Appendix A). No prices in UI code.
4. All price math runs **server-side**. The app only displays what the API returns.
5. Use the `test_vectors` and `reference_tables_base_chef` in Appendix A as unit-test fixtures.
6. Rounding: **half-up** (`floor(x + 0.5)`), never banker's rounding.
7. Ask me before adding scope not in this document.

## 1. Product summary

Chefos is a subscription and instant-booking platform for trained, verified home chefs who cook in the customer's own kitchen.

- **Launch scope:** one gated high-rise community, ~10 chefs, ~40 homes, 5 km radius max.
- **Chef supply:** existing cooks already working in the apartment + trained new chefs.
- **Customer buys groceries** (no grocery integration in v1).
- **Safety:** chef's phone records the kitchen session (consent-based); hygiene kit; ID card.
- **Chef benefits:** fixed monthly payout on the 1st, insurance and pension support, training.
- **Tagline:** Cook healthy, eat healthy, be healthy.
- **Brand:** navy `#14213D` and gold `#F2B134`, white wordmark "Chefos" with a chef's hat on the "C".

## 2. Roles

- **Customer:** browses chefs, subscribes or books instant, pays, tracks sessions, rates.
- **Chef:** accepts jobs, runs the session flow, sees earnings.
- **Ops (founder / representative):** onboarding, check-in, scheduling, payouts, disputes.

## 3. Functional requirements

### 3.1 Customer app
1. **Onboarding:** phone OTP; community and flat (verify via community code); household size; diet, allergies.
2. **Chef discovery:** cards show name, photo, rating, review count, meals served, time on Chefos, cuisine specialty, and **price**. Never show tier names, payout or fee. Filter by cuisine, price, timing.
3. **Plan builder:** weekly / monthly / quarterly; meals per day (1 default; MEAL2 / MEAL3 offered and auto-applied); meal timings; coupon field; clear total and cancellation rule shown **before** payment.
4. **Instant booking:** 1 or 2 meals, same day, same home; chef accepts or rejects; live status.
5. **Payment:** UPI via payment gateway (one-time payment per plan in the pilot; UPI AutoPay later). Webhook-confirmed status only.
6. **Live session:** chef on the way → arrived → recording on indicator → meal done.
7. **Feedback:** private quick tap after sessions; public rating for subscribers (see §9).
8. **Manage plan:** change chef, renew, cancel, invoices, recordings (own only), reminders 3 days, 1 day and on the due date.
9. **AI menu (phase 2):** inputs BMI, goal, cuisine, allergies, veg/non-veg days, cheat-meal day. Output are suggestions, not medical advice.

### 3.2 Chef app (keep minimal; Telugu / Hindi / English; large buttons; voice prompts)
1. **Daily check-in** with representative (QR / ID) = attendance. Receive fresh apron.
2. **Job card:** accept / reject instant jobs; then flat location on map.
3. **Session flow (cannot skip steps):** Reached → customer consent confirmed → **Start recording** (mandatory; session cannot start without it) → hygiene checklist (hand wash, gloves, apron, cap) → End → next customer.
4. **Earnings:** live net amount, payout on the 1st, bank-account verification status. **Never show the platform fee.**
5. Leave requests, short training videos, monthly feedback summary.

### 3.3 Ops dashboard
- Chef onboarding: KYC, bank penny-drop verification, kit issued, training status.
- Scheduling, instant dispatch, roster lock before month start.
- Pricing and coupon config (load/edit Appendix A), payments ledger, **monthly payout run**.
- Ratings, fraud flags, complaints; recording access for disputes only, with an **audit log**.

## 4. Pricing engine spec

### 4.1 Inputs
`chef_payout_base`, `household_band`, `plan` (weekly | monthly | quarterly), `meals_per_day` (1–3), `coupon`, `booking_type` (subscription | instant), `is_pilot_cook`.

### 4.2 Chef payout per meal (public rate card)
`payout = min(235, 110 + highest_rating_bonus + highest_tenure_bonus + highest_meals_bonus + specialty_bonus)`

- Rating bonus: 4.3+ → +10; 4.5+ → +20; 4.7+ → +35. Counts only with ≥ 20 subscriber ratings. 4.5+ and 4.7+ also need ≥ 12 months on the app and ≥ 300 meals.
- Tenure: 6 months +10; 12 months +20; 24 months +30.
- Meals served: 500 +10; 2,000 +20; 5,000 +35.
- Certified cuisine specialty: +25.
- Recalculate **monthly**. New chefs start with rating 4.0 (prior weight 5).

### 4.3 Customer price per meal, base band (3–4 people)
- `monthly = round(payout × 1.30)`
- `weekly = round5(monthly × 1.15)`
- `quarterly = round(monthly × 0.96)`
- `instant_1 = round5(monthly × 1.75)`; chef earns `round(payout × 1.5)`
- `instant_2 = round5(instant_1 × 1.8)`; chef earns `round5(instant_2 × 2/3)`

### 4.4 Household size
Multipliers: 1–2 → 0.85; 3–4 → 1.00 (base); 5–6 → 1.25; 7–8 → 1.50; 9+ → custom quote.
For non-base bands: `price = round5_half_up(base_band_price × multiplier)`; same for chef payout. Declared by the customer; one free extra guest.

### 4.5 MEAL2 / MEAL3 (2 and 3 meals per day)
Plans are priced for 1 meal/day. MEAL2 / MEAL3 reduce the per-meal price by a flat rupee amount at the base band, scaled by the band multiplier and rounded to ₹1:

| Plan | MEAL2 | MEAL3 |
|---|---|---|
| Weekly | −5 | −10 |
| Monthly | −3 | −8 |
| Quarterly | −2 | −4 |

`final = max(price_floor, one_meal_price − scaled_discount)`

### 4.6 Price floor (hard guard)
`price_floor_per_meal = chef_payout_for_band + 20`. Reject any price or coupon outcome below it. Applies to catalog prices, coupons and refund recalculation.

### 4.7 Reference price card (base chef, payout ₹110)

Per meal; 1 meal/day, then MEAL2 and MEAL3 per-meal prices.

| Band (payout, floor) | Plan | 1 meal | MEAL2 | MEAL3 |
|---|---|---|---|---|
| 1–2 (₹95, ₹115) | Weekly | 140 | 136 | 131 |
| | Monthly | 120 | 117 | 115 |
| | Quarterly | 115 | 115 | 115 |
| 3–4 (₹110, ₹130) | Weekly | 165 | 160 | 155 |
| | Monthly | 143 | 140 | 135 |
| | Quarterly | 137 | 135 | 133 |
| 5–6 (₹140, ₹160) | Weekly | 205 | 199 | 192 |
| | Monthly | 180 | 176 | 170 |
| | Quarterly | 170 | 167 | 165 |
| 7–8 (₹165, ₹185) | Weekly | 250 | 242 | 235 |
| | Monthly | 215 | 210 | 203 |
| | Quarterly | 205 | 202 | 199 |

Plan lengths: weekly 7 days, monthly 30, quarterly 90. `plan_total = per_meal × meals_per_day × days`.

Instant (customer price / chef earns):

| Band | 1 meal | 2 meals |
|---|---|---|
| 1–2 | 215 / 140 | 385 / 255 |
| 3–4 | 250 / 165 | 450 / 300 |
| 5–6 | 315 / 205 | 565 / 375 |
| 7–8 | 375 / 250 | 675 / 450 |

### 4.8 Pilot offer for existing apartment cooks
Chef payout = the cook's current agreed rate. Customer pays payout +30% (weekly), +15% (monthly), +10% (quarterly). Valid 6 months, then the universal card applies. **No coupons** on this rate.

## 5. Coupons
| Code | Rule |
|---|---|
| WEEK1 | ₹100 off first weekly plan (new users, once) |
| MONTH150 | ₹150 off first monthly plan (new users, once) |
| QTR300 | ₹300 off first quarterly plan (new users, once) |
| FIRSTMEAL | ₹50 off first instant 1-meal booking (new users, once) |
| REFER200 | ₹200 credit to both after the friend pays a **monthly or quarterly** plan; used on next plan; not valid on weekly or instant |
| MEAL2 / MEAL3 | Unlock 2 / 3 meals per day at the prices above; auto-apply at checkout; not on instant or pilot-cook rates |

Rules: one coupon per order; no stacking; limit per flat, phone number and device; total pilot budget ₹15,000; every code has an expiry; discounts are never refunded as cash; refunds are based on the amount actually paid; **reject any coupon that breaks the price floor**.

## 6. Billing, cancellation, price lock
- Customer pays **upfront** when subscribing; the cycle starts that day.
- Due-date reminders at 3 days, 1 day and on the day. Grace period 1 day. Unpaid after grace → plan ends automatically; reactivation allowed within 3 days if the slot is free.
- **Cancellation:** weekly and monthly are non-refundable once started. Quarterly: a started month is charged at the **monthly** per-meal price; full unstarted months are refunded; takes effect at the end of the current month. Refunds within 7 working days.
- **Price lock:** an active plan keeps its price until renewal even if the chef's rate changes.
- **Changing chef:** allowed; 2 free changes per month; price difference adjusted for remaining meals; old chef is notified immediately.
- Instant bookings: free cancellation up to a configurable time before the first meal. Both instant meals are the same day, same home; confirm chef availability for both slots before accepting.

## 7. Chef payroll
- Fixed monthly credit on the **1st of every month, holidays included**. Basis: completed meals × payout for that home's band, minus disclosed deductions.
- Customer prepayments are held in a **separate chef-payout account**; pre-fund 1–2 days before the payout date.
- Payout via payment provider's payout API; automatic retry on failure; reconciliation against the ledger; in-app + SMS credit notice.
- Bank account must be in the chef's own name, verified by **penny-drop name match** before the first payout. Store bank details encrypted; consent captured in-app.
- Optional mid-month advance (disabled by default; up to 35% of earned amount).

## 8. Pension, insurance, statutory (config placeholders)
- Statutory aggregator contribution placeholder: **2% of turnover** (operative rate pending notification).
- Voluntary: group accident + term cover (~₹200 / chef / month) and pension match (~₹300 / chef / month) into the chef's own account (e.g., APY or NPS). Register every chef on e-Shram.
- Eligibility for the voluntary layer is tied to 90 days and a minimum monthly meals count. Needs legal review.

## 9. Ratings
- Starting rating **4.0** (prior weight 5) for chefs who pass hygiene and cooking tests; show as "New on Chefos".
- Public rating from **paid subscribers only**; one per customer per plan period; a customer's score is the average of their ratings; per-customer weight cap 5; rolling 6-month window.
- Instant users give private feedback only. Weekly private feedback loop for chef improvement.
- Fraud checks: block self-booking, flag bursts of 5-star ratings from new accounts. Chefs can dispute a rating; recordings can settle it.

## 10. Recording and privacy (must-have before real users)
- Consent from the customer, the chef and notice to household members; shown before each session.
- The session **cannot start** unless recording is running; start timestamp + location check; record locally and upload later if the network fails; block start if recording can't begin.
- Frame the kitchen only. Encrypt in transit and at rest. Access only for the customer and ops for disputes; **audit-log every access**. Auto-delete after a set period (default 14 days) unless a complaint is open.
- Position recording as safety and dispute evidence, not AI detection, in v1.
- Complies with India's DPDP Act: purpose limitation, consent record, deletion. Needs legal review of consent text.

## 11. Cost model (margin reporting only)
`variable_cost_per_meal = 8 + 0.025 × customer_price_per_meal`
`net_per_meal = customer_price − chef_payout − variable_cost`
Alert ops when average net per meal drops below **₹12**.

Expected commission (your fee ÷ customer price), base chef: weekly ~33%, monthly ~23%, quarterly ~20%, instant ~33–34%.

## 12. Notifications
WhatsApp / SMS / push: payment reminders, chef assigned, chef on the way, session done, payout credited, plan ending.

## 13. Build order
1. **Pricing engine** (pure functions + config loader + unit tests from test vectors) and coupon validation with the floor guard.
2. **Session recording flow** and chef session state machine.
3. Plan purchase + payment webhook + subscription lifecycle (grace, auto-end, cancellation/refund).
4. Instant booking and dispatch.
5. Chef payroll run + penny-drop verification.
6. Ratings and fraud checks.
7. Ops dashboard.
8. Phase 2: AI menu, AutoPay, referrals polish, scheduling optimization.

## 14. Acceptance tests (minimum)
- Every value in `reference_tables_base_chef` is reproduced exactly by the engine.
- A ₹160-payout chef, 3–4 people, monthly 1 meal/day = **₹208** per meal.
- Coupons that would go below the floor are rejected (e.g., 1–2 band quarterly MEAL2/MEAL3 stay at ₹115).
- WEEK1, QTR300 and FIRSTMEAL on base-band prices never violate the floor.
- Quarterly cancellation on day 1 charges one month at the monthly per-meal price and refunds the remaining full months.
- Chef app never exposes platform fee or customer price tiers; customer app never exposes tiers or payout.

## 15. Open items (do not guess; ask)
- GST treatment of the platform fee and whether prices are tax-inclusive (CA).
- Statutory gig contribution operative rate (pending notification).
- Chef agreement wording, labour-law classification, DPDP consent text (lawyer).
- Payment provider choice and fees for split settlement / payouts.
- Bank partner for chef accounts; fallback is chef's own account with penny-drop.
- Calibrate base payout (₹110) against what cooks in the target apartment actually charge.

---

## Appendix A — Pricing config (source of truth)

```json
{
  "meta": {
    "name": "Chefos pricing model",
    "version": "1.0.0-pilot",
    "date": "2026-10-19",
    "currency": "INR",
    "status": "pilot estimates - validate against local cook rates (4-5 cooks in the target apartment) before launch",
    "tax_note": "All prices and margins are before GST. Whether GST applies to the platform fee, and whether prices are tax-inclusive, must be confirmed with a CA.",
    "principle": "Chef payout is fixed and never reduced by coupons. All discounts come out of the platform fee and may never push a price below the price floor."
  },
  "rounding": {
    "mode": "half_up",
    "rules": {
      "monthly_per_meal": "nearest 1",
      "weekly_per_meal": "nearest 5",
      "quarterly_per_meal": "nearest 1",
      "instant_prices": "nearest 5",
      "size_band_scaling": "price_for_band = round_half_up_to_5(base_band_price * multiplier); base band (3-4) is not re-rounded"
    }
  },
  "chef_rate_card": {
    "base_payout_per_meal": 110,
    "payout_cap_per_meal": 235,
    "calculation": "payout = min(cap, base + highest_rating_bonus + highest_tenure_bonus + highest_meals_bonus + specialty_bonus)",
    "rating_bonus": [
      {
        "min_rating": 4.3,
        "bonus": 10,
        "requires": {
          "min_subscriber_ratings": 20
        }
      },
      {
        "min_rating": 4.5,
        "bonus": 20,
        "requires": {
          "min_subscriber_ratings": 20,
          "min_tenure_months": 12,
          "min_meals_served": 300
        }
      },
      {
        "min_rating": 4.7,
        "bonus": 35,
        "requires": {
          "min_subscriber_ratings": 20,
          "min_tenure_months": 12,
          "min_meals_served": 300
        }
      }
    ],
    "tenure_bonus": [
      {
        "min_months": 6,
        "bonus": 10
      },
      {
        "min_months": 12,
        "bonus": 20
      },
      {
        "min_months": 24,
        "bonus": 30
      }
    ],
    "meals_served_bonus": [
      {
        "min_meals": 500,
        "bonus": 10
      },
      {
        "min_meals": 2000,
        "bonus": 20
      },
      {
        "min_meals": 5000,
        "bonus": 35
      }
    ],
    "specialty_bonus": {
      "certified_cuisine_specialty": 25
    },
    "recalculate": "monthly",
    "visibility": {
      "user_app_shows": [
        "chef_name",
        "photo",
        "rating",
        "review_count",
        "meals_served",
        "time_on_chefos",
        "cuisine_specialty",
        "price"
      ],
      "user_app_hides": [
        "tier",
        "chef_payout",
        "platform_fee"
      ],
      "chef_app_shows": [
        "own_payout_per_meal",
        "earnings_to_date"
      ],
      "chef_app_hides": [
        "platform_fee"
      ]
    }
  },
  "ratings": {
    "starting_rating": 4.0,
    "starting_rating_prior_weight": 5,
    "starting_rating_requires": [
      "hygiene_training_passed",
      "cooking_test_passed"
    ],
    "who_can_rate": "paid subscribers only",
    "one_rating_per_customer_per_plan_period": true,
    "customer_score": "average of that customer's ratings for the chef",
    "per_customer_weight_cap": 5,
    "rolling_window_months": 6,
    "instant_users": "private feedback only, does not affect public rating",
    "sub_ratings": [
      "taste",
      "hygiene",
      "punctuality"
    ],
    "chef_can_dispute": true,
    "drop_handling": {
      "grace_days": 45,
      "action": "retraining before payout bonus is reduced"
    },
    "fraud_checks": [
      "block_self_booking",
      "flag_many_5_star_from_new_accounts",
      "limit_one_rating_per_plan_period"
    ]
  },
  "household_size": {
    "base_band": "3-4",
    "applies_to": "customer price and chef payout together",
    "bands": [
      {
        "id": "1-2",
        "label": "1-2 people",
        "min": 1,
        "max": 2,
        "multiplier": 0.85
      },
      {
        "id": "3-4",
        "label": "3-4 people (base)",
        "min": 3,
        "max": 4,
        "multiplier": 1.0
      },
      {
        "id": "5-6",
        "label": "5-6 people",
        "min": 5,
        "max": 6,
        "multiplier": 1.25
      },
      {
        "id": "7-8",
        "label": "7-8 people",
        "min": 7,
        "max": 8,
        "multiplier": 1.5
      }
    ],
    "9_plus": {
      "pricing": "custom_quote"
    },
    "free_extra_guests": 1,
    "declared_by": "customer at booking",
    "resize_policy": "update from next billing cycle, never mid-plan; verify with session recording if disputed",
    "events_parties": "quoted separately"
  },
  "plans": {
    "weekly": {
      "days": 7,
      "per_meal_formula": "round5(monthly_per_meal * 1.15)"
    },
    "monthly": {
      "days": 30,
      "per_meal_formula": "round(chef_payout * 1.30)"
    },
    "quarterly": {
      "days": 90,
      "per_meal_formula": "round(monthly_per_meal * 0.96)"
    },
    "base_meals_per_day": 1,
    "same_price_whether_meals_cooked_together_or_separately": true
  },
  "meal_bundles": {
    "note": "Plans are priced for 1 meal/day. 2 and 3 meals/day are unlocked with MEAL2 / MEAL3 coupons that reduce the per-meal price.",
    "MEAL2": {
      "meals_per_day": 2,
      "per_meal_discount_inr_at_base_band": {
        "weekly": 5,
        "monthly": 3,
        "quarterly": 2
      }
    },
    "MEAL3": {
      "meals_per_day": 3,
      "per_meal_discount_inr_at_base_band": {
        "weekly": 10,
        "monthly": 8,
        "quarterly": 4
      }
    },
    "discount_scaling": "discount = round_half_up_to_1(base_discount * band_multiplier)",
    "final_price_rule": "max(price_floor_per_meal, one_meal_price - discount)",
    "auto_apply_at_checkout": true,
    "not_applicable_to": [
      "instant",
      "pilot_cook_rate"
    ]
  },
  "instant": {
    "same_day_same_home": true,
    "options": {
      "1_meal": {
        "customer_price_formula": "round5(monthly_per_meal * 1.75)",
        "chef_earns_formula": "round(chef_payout * 1.5)"
      },
      "2_meals": {
        "customer_price_formula": "round5(instant_1_meal_customer_price * 1.8)",
        "chef_earns_formula": "round5(customer_price * 2/3)",
        "note": "both meals same day, same home; one visit or two at the same price; chef availability for both slots must be confirmed before booking is accepted"
      }
    },
    "peak_surcharge": {
      "enabled": false,
      "hours": [
        "12:00-14:00"
      ],
      "amount_inr_range": [
        20,
        30
      ]
    },
    "max_meals": 2
  },
  "pilot_cook_offer": {
    "applies_to": "existing apartment cooks who join Chefos",
    "chef_payout": "their current agreed rate (set per cook)",
    "customer_markup_on_payout": {
      "weekly": 0.3,
      "monthly": 0.15,
      "quarterly": 0.1
    },
    "duration_months": 6,
    "after": "universal rate card applies",
    "coupons_allowed": false
  },
  "coupons": [
    {
      "code": "WEEK1",
      "type": "flat_off_first_plan",
      "amount": 100,
      "applies_to": [
        "weekly"
      ],
      "audience": "new_users",
      "max_uses_per_user": 1
    },
    {
      "code": "MONTH150",
      "type": "flat_off_first_plan",
      "amount": 150,
      "applies_to": [
        "monthly"
      ],
      "audience": "new_users",
      "max_uses_per_user": 1
    },
    {
      "code": "QTR300",
      "type": "flat_off_first_plan",
      "amount": 300,
      "applies_to": [
        "quarterly"
      ],
      "audience": "new_users",
      "max_uses_per_user": 1
    },
    {
      "code": "FIRSTMEAL",
      "type": "flat_off_first_instant",
      "amount": 50,
      "applies_to": [
        "instant_1_meal"
      ],
      "audience": "new_users",
      "max_uses_per_user": 1
    },
    {
      "code": "REFER200",
      "type": "referral_credit",
      "amount_each": 200,
      "applies_to": [
        "monthly",
        "quarterly"
      ],
      "trigger": "friend completes first paid monthly or quarterly plan",
      "not_valid_for": [
        "weekly",
        "instant"
      ],
      "credit_used_on": "next plan"
    },
    {
      "code": "MEAL2",
      "type": "meal_bundle",
      "ref": "meal_bundles.MEAL2",
      "applies_to": [
        "weekly",
        "monthly",
        "quarterly"
      ]
    },
    {
      "code": "MEAL3",
      "type": "meal_bundle",
      "ref": "meal_bundles.MEAL3",
      "applies_to": [
        "weekly",
        "monthly",
        "quarterly"
      ]
    }
  ],
  "coupon_rules": {
    "one_coupon_per_order": true,
    "stacking": false,
    "welcome_coupons_new_users_only": true,
    "limit_per": [
      "flat",
      "phone_number",
      "device"
    ],
    "total_budget_inr_pilot": 15000,
    "expiry_required": true,
    "discount_is_never_refunded_as_cash": true,
    "refund_basis": "amount actually paid by customer",
    "reject_if": "resulting per-meal price < price_floor_per_meal"
  },
  "guards": {
    "price_floor": {
      "per_meal": "chef_payout_for_band + 20",
      "enforced_on": [
        "catalog_price",
        "coupon_application",
        "refunds_recalculation"
      ]
    },
    "min_net_per_meal_alert_inr": 12,
    "alert_action": "review discounts monthly; reduce MEAL3 / quarterly discounts by 3-5 INR per meal if breached"
  },
  "cost_model": {
    "note": "Used for margin reporting only. Values are estimates.",
    "variable_cost_per_meal": {
      "fixed_inr": 8,
      "percent_of_price": 0.025
    },
    "components_included": [
      "statutory_gig_contribution_placeholder_2pct",
      "payment_fees",
      "insurance_pension_share",
      "kit_and_laundry",
      "support_cloud_recording"
    ],
    "statutory_contribution": {
      "rate": 0.02,
      "status": "placeholder - operative rate pending government notification"
    },
    "net_per_meal_formula": "customer_price_per_meal - chef_payout_per_meal - (8 + 0.025 * customer_price_per_meal)"
  },
  "billing_rules": {
    "payment": "upfront at subscription; cycle starts on subscription date",
    "grace_days_after_due": 1,
    "unpaid_after_grace": "plan ends automatically; reactivation allowed within 3 days if slot is free",
    "reminders_days_before_due": [
      3,
      1,
      0
    ],
    "price_lock": "active plan keeps its price until renewal, even if chef's rate changes",
    "chef_change": {
      "allowed": true,
      "free_changes_per_month": 2,
      "price_difference": "adjusted for remaining meals",
      "notify_old_chef": true
    },
    "cancellation": {
      "weekly": "no refund once the week has started",
      "monthly": "no refund once the month has started",
      "quarterly": "a started month is charged in full at the monthly per-meal price; full unstarted months are refunded; effective at end of current month",
      "instant": "free cancellation up to a set time before first meal (configure per launch)"
    },
    "refund_timeline_working_days": 7
  },
  "chef_payroll": {
    "frequency": "monthly",
    "date": "1st of every month, including holidays",
    "basis": "completed meals x payout for that home's size band, minus disclosed deductions",
    "funding": "customer prepayments held in a separate chef-payout account; pre-fund 1-2 days before payout date",
    "optional_advance": {
      "enabled": false,
      "max_share_of_earned": 0.35,
      "note": "enable if pilot chefs ask for mid-month cash flow"
    },
    "bank_account": "chef's own name, verified by penny-drop before first payout"
  },
  "reference_tables_base_chef": {
    "chef_payout_base": 110,
    "description": "Generated from the formulas above for a chef at base payout (110). Use as test vectors. Prices are per meal unless stated.",
    "by_household_band": {
      "1-2": {
        "chef_payout_per_meal": 95,
        "price_floor_per_meal": 115,
        "plans": {
          "weekly": {
            "1_meal_per_day": 140,
            "MEAL2_per_meal": 136,
            "MEAL3_per_meal": 131
          },
          "monthly": {
            "1_meal_per_day": 120,
            "MEAL2_per_meal": 117,
            "MEAL3_per_meal": 115
          },
          "quarterly": {
            "1_meal_per_day": 115,
            "MEAL2_per_meal": 115,
            "MEAL3_per_meal": 115
          }
        },
        "instant": {
          "1_meal": {
            "customer_price": 215,
            "chef_earns": 140
          },
          "2_meals": {
            "customer_price": 385,
            "chef_earns": 255
          }
        }
      },
      "3-4": {
        "chef_payout_per_meal": 110,
        "price_floor_per_meal": 130,
        "plans": {
          "weekly": {
            "1_meal_per_day": 165,
            "MEAL2_per_meal": 160,
            "MEAL3_per_meal": 155
          },
          "monthly": {
            "1_meal_per_day": 143,
            "MEAL2_per_meal": 140,
            "MEAL3_per_meal": 135
          },
          "quarterly": {
            "1_meal_per_day": 137,
            "MEAL2_per_meal": 135,
            "MEAL3_per_meal": 133
          }
        },
        "instant": {
          "1_meal": {
            "customer_price": 250,
            "chef_earns": 165
          },
          "2_meals": {
            "customer_price": 450,
            "chef_earns": 300
          }
        }
      },
      "5-6": {
        "chef_payout_per_meal": 140,
        "price_floor_per_meal": 160,
        "plans": {
          "weekly": {
            "1_meal_per_day": 205,
            "MEAL2_per_meal": 199,
            "MEAL3_per_meal": 192
          },
          "monthly": {
            "1_meal_per_day": 180,
            "MEAL2_per_meal": 176,
            "MEAL3_per_meal": 170
          },
          "quarterly": {
            "1_meal_per_day": 170,
            "MEAL2_per_meal": 167,
            "MEAL3_per_meal": 165
          }
        },
        "instant": {
          "1_meal": {
            "customer_price": 315,
            "chef_earns": 205
          },
          "2_meals": {
            "customer_price": 565,
            "chef_earns": 375
          }
        }
      },
      "7-8": {
        "chef_payout_per_meal": 165,
        "price_floor_per_meal": 185,
        "plans": {
          "weekly": {
            "1_meal_per_day": 250,
            "MEAL2_per_meal": 242,
            "MEAL3_per_meal": 235
          },
          "monthly": {
            "1_meal_per_day": 215,
            "MEAL2_per_meal": 210,
            "MEAL3_per_meal": 203
          },
          "quarterly": {
            "1_meal_per_day": 205,
            "MEAL2_per_meal": 202,
            "MEAL3_per_meal": 199
          }
        },
        "instant": {
          "1_meal": {
            "customer_price": 375,
            "chef_earns": 250
          },
          "2_meals": {
            "customer_price": 675,
            "chef_earns": 450
          }
        }
      }
    }
  },
  "test_vectors": [
    {
      "case": "base chef, 3-4 people, monthly 1 meal/day, 30 days",
      "per_meal": 143,
      "total": 4290
    },
    {
      "case": "base chef, 3-4 people, monthly MEAL2, 30 days",
      "per_meal": 140,
      "total": 8400
    },
    {
      "case": "base chef, 3-4 people, monthly MEAL3, 30 days",
      "per_meal": 135,
      "total": 12150
    },
    {
      "case": "base chef, 3-4 people, quarterly 1 meal/day, 90 days",
      "per_meal": 137,
      "total": 12330
    },
    {
      "case": "base chef, 3-4 people, weekly 1 meal/day, 7 days",
      "per_meal": 165,
      "total": 1155
    },
    {
      "case": "base chef, 3-4 people, instant 1 meal",
      "customer_price": 250,
      "chef_earns": 165
    },
    {
      "case": "base chef, 3-4 people, instant 2 meals",
      "customer_price": 450,
      "chef_earns": 300
    },
    {
      "case": "chef payout 160, 3-4 people, monthly 1 meal/day",
      "per_meal": 208
    },
    {
      "case": "base chef, 5-6 people, monthly 1 meal/day",
      "per_meal": 180,
      "chef_payout": 140
    }
  ]
}
```
