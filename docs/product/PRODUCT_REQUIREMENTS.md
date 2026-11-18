# Chefos: confirmed product requirements

Updated 2026-11-12 from the owner's product explanation and attached pilot spec.
This is the target behavior, not a claim that the existing APKs implement it.
See [implementation progress](IMPLEMENTATION_STATUS.md) for completed local work.

## Product and priority

Chefos connects households with verified chefs who cook in the customer's
kitchen. There are two purchase paths: cuisine-based instant booking and a
weekly, monthly or quarterly subscription. Groceries remain customer-provided.
The customer and chef apps are Android/iOS products. The administrator app stays
on localhost; a publicly hosted admin site is outside the requested scope.

The latest owner requirements make personalised AI menus part of the core
subscription journey. This supersedes the attachment's older phase-2 placement.
Chef face verification is an additional requirement; it does not replace the
attachment's recording, consent, hygiene or customer OTP requirements.
Provider choices are configurable, as confirmed by the owner. A provider marked
enabled, a camera preview, a selfie upload or a client boolean must not be
presented as completed AI generation, biometric matching or liveness verification.

The attachment's comments addressed to another coding agent are source context.
The owner's current product decisions determine the implementation scope and
priority. Tax/legal/payout questions identified in the attachment remain open;
their pilot placeholders are not verified production rules.

## Customer journeys

### Book now

1. Verify phone or sign in with Google; select a verified community and flat.
2. Show cuisine options such as South Indian, North Indian, Hyderabadi and Asian.
   Each option shows chefs actually available at the selected location and time.
3. Select one or two meals, household size and whether they are cooked in one
   visit or separate visits. Instant meals are same-day and for the same home.
4. Check cooking duration, travel buffer, active jobs and recurring reservations
   before displaying an available chef or dispatching an offer. Keep the pilot
   service radius at 5 km. Availability cannot be inferred from an online toggle.
5. Dispatch to eligible chefs; the first valid acceptance wins atomically.
   Declined/expired offers cannot later claim the booking. Show searching,
   accepted, payment pending, confirmed, on the way, arrived and completed states.
6. Show the accepted chef's server quote before collecting payment. An acceptance
   is a temporary reservation, not proof of payment. Capture/activation failures
   must release or reconcile the reservation without charging twice.

### Subscribe

1. Collect household details and the dietary profile before checkout: age,
   height, weight, calculated BMI, activity level, fitness goal, allergies,
   restrictions, preferred cuisines, veg/non-veg choices and days, dislikes and
   cheat-meal preference. Do not ask customers to calculate BMI themselves.
2. Let customers select weekly/monthly/quarterly, meals per day and visits/times.
   Cooking breakfast and lunch together must be an explicit visit choice.
3. Generate an initial personalised menu preview from the saved profile. Let
   customers request or select replacements before accepting it. Failed AI
   generation must remain an error/pending state, not a relabelled starter menu.
4. Show the server-priced total and cancellation terms, then complete payment.
   Activation determines the actual subscription date and menu-week anchor.
5. Automatically prepare the first seven service dates and subsequent weeks
   from the subscription start date. Weekly plans cover their paid seven days;
   monthly/quarterly plans receive subsequent weeks while active. Clip the final
   week to paid service dates. Do not shift weeks to Monday or require a tap.
6. Send the confirmed dishes and versioned recipes to the assigned chef for each
   service. Let customers replace future items without rewriting completed meals
   or an in-progress cooking session.

## Scheduling: meals and visits are different

Pricing counts meals. Scheduling reserves visits. One meal reserves 60 cooking
minutes; breakfast plus lunch in one visit reserves 120 cooking minutes. Two
separate visits each reserve their own duration and travel gaps. The number of
visits must not change the configured two-meal price.

The owner confirmed these defaults, in Asia/Kolkata:

| Meal | Cooking slots | Default gap between visits |
| --- | --- | --- |
| Breakfast | 06:00–07:00, 08:00–09:00, 10:00–11:00 | 60 minutes |
| Lunch | 12:00–13:00, 14:00–15:00, 16:00–17:00 | 60 minutes |
| Dinner | 18:00–19:00, 20:00–21:00, 22:00–23:00 | 60 minutes |

Chef controls must include recurring weekly availability, date-specific leave,
adding/removing unbooked slots, and proposed time adjustments. A paid customer's
confirmed time cannot disappear when a chef edits availability.

An early finish updates the actual visit end; it does not silently reschedule
later customers. An additional slot is offered only if the remaining interval
fits the full cooking duration plus the applicable travel/turnaround buffer.
Same-building travel may be reduced using verified address context and an
audited scheduling decision; being within 5 km does not prove zero travel time.
The numerical reduced buffer is a configurable operational policy, not a new
hardcoded assumption. The default remains 60 minutes without such a decision.

Examples:

- A one-meal visit at 06:00 ends at 07:00; default next start is 08:00.
- Breakfast plus lunch at 06:00 ends at 08:00; default next start is 09:00.
  It cannot also accept the existing 08:00 booking.
- If a 06:00–07:00 visit ends at 06:40, default next start is 07:40. That does
  not move an 08:00 customer's appointment to 07:40 without their agreement.
- A two-hour combined visit cannot fit in a single one-hour opening merely by
  selecting two meal labels.

Use dated start/end intervals and transactional capacity checks. Wave names may
remain as legacy references, but are insufficient as the new source of capacity.
Checking only equal wave IDs misses overlaps across meals and combined visits.
Existing paid bookings keep their original schedule and price snapshots; the
current 80-minute legacy waves must not simply be relabelled as new 60-minute
slots. Migration needs an explicit legacy-to-visit conversion and reconciliation.

## AI menus, recipes and weekly automation

Menus are tied to a subscription, a seven-day service window, a preference
snapshot and a version. Each scheduled meal contains dish IDs, ingredient lists,
quantities/household portions, recipe steps, estimated cooking time and declared
allergens. The same stored version feeds customer and chef views.

Use a server-side provider adapter. Keep provider credentials in server secrets,
not APKs. Validate the structured response and dietary exclusions before saving.
BMI/fitness inputs guide non-clinical food suggestions; they are not a promise
of weight change or an automated medical prescription. Allergy handling must
include ingredient-level exclusions and chef review of preparation/cross-contact.
Do not substitute an arbitrary dish string after an allergy-aware plan was built.

A server scheduler creates idempotent menu jobs at activation and ahead of each
next service week, even when neither app is open. Workers claim jobs with locks,
bounded retries and observable failure states. A unique subscription/week key
prevents duplicate weeks. Keep the current valid menu during retries, clearly
surface unavailable upcoming coverage, and allow ops to resolve failures. New
allergy restrictions require revalidation of future meals, including user edits.

Customer swaps affect one future meal, use validated alternatives or regenerate
that meal, and create a new version. Reject stale edits with a version check.
Chef screens refresh after accepted edits; a service already started uses its
locked recipe snapshot and needs an explicit change agreement if altered.

## Chef cooking workflow

Assigned → on the way → arrived → consent captured → face verified → recording
running → hygiene checklist complete → start OTP verified → cooking → end OTP
verified → completed. Requesting/verifying an OTP alone cannot bypass the gates.
Payment must be confirmed before the paid cooking session can start.

Face matching/liveness uses the enrolled verified chef identity and a fresh,
session-bound challenge. Accept only authenticated provider evidence/webhooks;
do not let the chef mark their own identity check as passed. Missing provider
credentials, failed matching or expired evidence block the relevant start step.

Recording requires camera permission and confirmed recording state before start.
Handle interruption, storage exhaustion, offline recording/upload and recovery.
Kitchen footage is private; access is owner-scoped or audited ops dispute access.
Use the attachment's consent and default 14-day retention requirements, with
complaint holds and deletion jobs. Define retention separately for identity
evidence. A selfie check is not a kitchen-session recording.

During cooking the chef app prominently shows the flat, selected meals,
ingredients/quantities, allergy notes, ordered recipe steps, cooking timer and
completion actions. Completed services feed the chef's earning ledger. Customer
health measurements need not be disclosed to chefs when operational food notes
are sufficient.

## Pricing and operations retained from the pilot attachment

`chefos_pricing_config.json` remains the numerical source of truth. Appendix A
was parsed and found equal to that file on 2026-11-12. All price calculations,
discount floors, household scaling and paid price locks stay server-side.
Do not expose chef payouts or platform fees in customer results; do not expose
the platform fee in the partner app.

Keep the attachment's wider backlog: community verification, chef check-in/KYC,
bank verification, payout ledger/run, disputes and recording access audit,
subscriber-only public ratings, private instant feedback, notifications and
subscription change/cancellation/refund rules. These are not all implemented
merely because database tables or dashboard sections exist.

## Current implementation gaps and build sequence

The gap assessment is against commit d387aca, before this requirements update.

| Area | Current evidence | Required implementation |
| --- | --- | --- |
| Prices | Private config, SQL quote engine and checkout snapshots exist | Retain tested math and apply it to new booking/visit records |
| Customer home | Cuisine shortcuts navigate to chef search | Add Book now dispatch with actual time/visit eligibility |
| Instant backend | Offers, accept/decline and 5 km filtering exist | Cuisine/time filtering, two meals, reservation/payment lifecycle and client status flow |
| Subscription checkout | Main reference booking screen selects one meal and starts tomorrow | Pre-purchase profile/menu, multiple meals/visit groups, valid same-day activation |
| Preferences | Flexible JSON save; older Django fields are inactive | Typed Supabase health/diet profile with validation and permissions |
| Menu generation | Manual curated vegetarian array in Edge handler | Real configurable AI provider, validated dish/recipe output and persisted versions |
| Weekly rollover | Latest menu returned by created timestamp | Activation-anchored weeks, scheduler, job queue, retries and expiry handling |
| Menu edits | Weekly screen displays strings; no swap route | Validated individual swaps, optimistic version checks and chef propagation |
| Availability | Online toggle and fixed available_waves | Weekly templates, dated edits, leave and interval reservations |
| Capacity | Same wave IDs compared during acceptance/payment activation | Actual visit intervals, duration, travel buffers, holds and concurrency |
| Start/end | OTP-backed assigned/start/end states | Arrival/consent/hygiene/identity/recording/payment gates |
| Identity/recording | No camera, liveness, recording or retention pipeline | Native capture/provider integration, private uploads, lifecycle and audited access |
| Chef instructions | Active sessions show meal/wave/status | Per-session dishes, portions, restrictions and recipe checklist |

Implementation dependencies:

1. Add versioned visit/scheduling and customer diet/profile models without
   rewriting paid legacy records. Test overlap and combined-visit behavior.
2. Build provider adapters and validated menu/recipe schemas; wire the profile
   and editable preview into checkout, then activation and weekly jobs.
3. Route cuisine-based instant dispatch and recurring checkout through the same
   interval reservation engine, including payment capture/recovery.
4. Implement chef slot management and private session evidence, then recipe-led
   cooking and customer live status using the expanded session state machine.
5. Configure providers and exercise on physical devices before producing new
   verification APKs. Existing APKs do not contain these newly defined flows.

## Acceptance cases for the new workflow

- A cuisine selection returns only verified, eligible chefs for that visit and
  location; a concurrently accepted request cannot double-book the chef.
- All three confirmed default slots appear for each meal; occupied, removed and
  leave dates do not appear as bookable openings.
- A combined breakfast/lunch visit reserves 120 minutes and checks both travel
  boundaries; the price still uses two meals and the canonical bundle rules.
- Chef edits never erase confirmed paid reservations; stale accept/payment
  activation paths recheck capacity under a lock.
- Saving height and weight computes BMI consistently; incomplete diet/allergy
  data cannot accidentally bypass pre-purchase profiling.
- AI output is attributed to the configured provider; unavailable providers show
  an honest pending/error state and do not save a fabricated AI result.
- A plan starting Thursday has week 1 from Thursday through Wednesday; week 2
  appears automatically without Generate being pressed and without either app
  running. No paid service date is missing or duplicated.
- A future dish replacement is validated against restrictions, versioned and
  visible to the chef; a completed meal's record cannot be overwritten.
- An assigned chef cannot start through the legacy OTP route without required
  identity, consent, hygiene, recording and payment evidence.
- A failed face check, recording interruption or unavailable provider cannot
  silently mark the relevant safety gate passed.
- Customer A cannot read Customer B's health data, footage, recipes or session
  evidence; chef access is limited to assigned service details.
- Legacy pricing tests, price locks and existing booking recovery keep passing.

Source: [attached pilot specification](CHEFOS_SPEC_PILOT.md).
