// Scheduling v2. Consumers must supply server-owned reservations/address IDs and
// approval records, never trust a client to declare an approved travel reduction.
// Legacy waves keep their existing meaning; this does not relabel paid slots.
export type Meal = "breakfast" | "lunch" | "dinner";
export const SCHEDULE_VERSION = 2;
export const COOKING_MINUTES_PER_MEAL = 60;
export const DEFAULT_TRAVEL_MINUTES = 60;
export const DEFAULT_START_MINUTES: Readonly<Record<Meal, readonly number[]>> = Object.freeze({
  breakfast: Object.freeze([360, 480, 600]),
  lunch: Object.freeze([720, 840, 960]),
  dinner: Object.freeze([1080, 1200, 1320]),
});
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
const MINUTE = 60_000;
const DAY = 86_400_000;

function instant(value: string): number {
  // Explicit offset required: server/worker timezone cannot change bookings.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("A timestamp with timezone is required");
  day(value.slice(0, 10));
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid visit time");
  return result;
}
function mealSelection(values: readonly Meal[]): void {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3 ||
    new Set(values).size !== values.length || values.some((m) => !MEALS.includes(m))) {
    throw new Error("Select each meal once");
  }
}
export function cookingMinutes(meals: readonly Meal[]): number {
  mealSelection(meals);
  return meals.length * COOKING_MINUTES_PER_MEAL;
}

export type Visit = {
  id: string;
  chefId: string;
  startsAt: string;
  endsAt: string;
  // These IDs must come from verified server address records.
  buildingId?: string | null;
};
export function planVisits(
  selectedMeals: readonly Meal[],
  selections: { id: string; chefId: string; startsAt: string; meals: Meal[]; buildingId?: string }[],
): (Visit & { meals: Meal[]; cookingMinutes: number })[] {
  mealSelection(selectedMeals);
  const supplied = selections.flatMap((v) => v.meals);
  if (selections.length < 1 || selections.length > 3 ||
    new Set(selections.map((v) => v.chefId)).size !== 1 ||
    new Set(selections.map((v) => v.id)).size !== selections.length ||
    supplied.length !== selectedMeals.length || new Set(supplied).size !== supplied.length ||
    supplied.some((m) => !selectedMeals.includes(m))) {
    throw new Error("Every selected meal must belong to exactly one visit");
  }
  const result = selections.map((v) => {
    if (!v.id || !v.chefId) throw new Error("A visit and chef identity are required");
    const duration = cookingMinutes(v.meals);
    return { ...v, cookingMinutes: duration,
      endsAt: new Date(instant(v.startsAt) + duration * MINUTE).toISOString() };
  });
  // Disjoint meal labels do not imply disjoint physical appointments.
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      if (instant(result[i].startsAt) < instant(result[j].endsAt) &&
        instant(result[j].startsAt) < instant(result[i].endsAt)) {
        throw new Error("Your cooking visits overlap");
      }
    }
  }
  return result;
}

export type Reservation = Visit & {
  status: "held" | "confirmed" | "in_progress" | "completed" | "cancelled";
  holdExpiresAt?: string;
  actualEndedAt?: string;
};
export type TravelApproval = {
  beforeVisitId: string;
  afterVisitId: string;
  buildingId: string;
  minutes: number;
  approvedBy: string;
};
function travelMinutes(before: Visit, after: Visit, approvals: readonly TravelApproval[]): number {
  const approval = approvals.find((a) => a.beforeVisitId === before.id && a.afterVisitId === after.id);
  if (!approval) return DEFAULT_TRAVEL_MINUTES;
  if (!approval.approvedBy || !approval.buildingId || before.buildingId !== approval.buildingId ||
    after.buildingId !== approval.buildingId || !Number.isInteger(approval.minutes) ||
    approval.minutes < 0 || approval.minutes > DEFAULT_TRAVEL_MINUTES) {
    throw new Error("Invalid server travel approval");
  }
  return approval.minutes;
}
function bounds(visit: Visit): [number, number] {
  const start = instant(visit.startsAt), end = instant(visit.endsAt);
  if (end <= start) throw new Error("A visit must have positive cooking duration");
  return [start, end];
}

export function visitConflicts(
  candidate: Visit,
  reservations: readonly Reservation[],
  now: string,
  approvals: readonly TravelApproval[] = [],
): { reservationId: string; reason: "cooking_overlap" | "travel_buffer" | "overrun" }[] {
  const [start, end] = bounds(candidate), clock = instant(now);
  if (!candidate.id || !candidate.chefId || start < clock) throw new Error("Choose a future visit");
  const conflicts: ReturnType<typeof visitConflicts> = [];
  for (const existing of reservations) {
    if (existing.chefId !== candidate.chefId || existing.status === "cancelled") continue;
    if (existing.status === "held") {
      if (!existing.holdExpiresAt) throw new Error("A payment hold needs an expiry");
      if (instant(existing.holdExpiresAt) <= clock) continue;
    }
    const [otherStart, plannedEnd] = bounds(existing);
    let otherEnd = plannedEnd;
    if (existing.status === "completed") {
      if (!existing.actualEndedAt) throw new Error("Completion needs a verified actual end time");
      otherEnd = instant(existing.actualEndedAt);
      if (otherEnd < otherStart || otherEnd > clock) throw new Error("Invalid actual completion time");
    }
    const overrun = existing.status === "in_progress" && plannedEnd <= clock;
    if (overrun) otherEnd = Number.POSITIVE_INFINITY;
    if (start < otherEnd && otherStart < end) {
      conflicts.push({ reservationId: existing.id, reason: overrun ? "overrun" : "cooking_overlap" });
    } else if (start >= otherEnd) {
      if (start - otherEnd < travelMinutes(existing, candidate, approvals) * MINUTE) {
        conflicts.push({ reservationId: existing.id, reason: "travel_buffer" });
      }
    } else if (otherStart - end < travelMinutes(candidate, existing, approvals) * MINUTE) {
      conflicts.push({ reservationId: existing.id, reason: "travel_buffer" });
    }
  }
  return conflicts;
}

function day(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("An ISO service date is required");
  const parsed = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid service date");
  }
  return parsed;
}
// Job keys are subscription ID + startDate. A worker can schedule this while
// both apps are closed; a screen's Monday-based day index is not the authority.
export function subscriptionMenuWindow(startDate: string, endDate: string, serviceDate: string) {
  const start = day(startDate), end = day(endDate), date = day(serviceDate);
  if (end < start || date < start || date > end) throw new Error("Date is outside the paid plan");
  const weekIndex = Math.floor((date - start) / DAY / 7);
  const windowStart = start + weekIndex * 7 * DAY;
  return {
    weekIndex,
    startDate: new Date(windowStart).toISOString().slice(0, 10),
    endDate: new Date(Math.min(end, windowStart + 6 * DAY)).toISOString().slice(0, 10),
    dayIndex: Math.floor((date - windowStart) / DAY),
  };
}
