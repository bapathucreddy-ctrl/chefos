import { cookingMinutes, DEFAULT_START_MINUTES, planVisits, Reservation, subscriptionMenuWindow, Visit, visitConflicts } from "./_shared/scheduling.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function rejects(fn: () => unknown) { try { fn(); } catch { return; } throw new Error("Expected rejection"); }
const at = (time: string) => `2026-11-13T${time}:00+05:30`;
const visit = (id: string, start: string, end: string): Visit => ({ id, chefId: "chef", startsAt: at(start), endsAt: at(end) });
const booked = (id: string, start: string, end: string): Reservation => ({ ...visit(id, start, end), status: "confirmed" });
Deno.test("confirmed schedule defaults and meal-to-visit partition", () => {
  equal(DEFAULT_START_MINUTES, { breakfast: [360, 480, 600], lunch: [720, 840, 960], dinner: [1080, 1200, 1320] });
  equal(cookingMinutes(["breakfast", "lunch"]), 120);
  const together = planVisits(["breakfast", "lunch"], [{ id: "a", chefId: "chef", startsAt: at("06:00"), meals: ["breakfast", "lunch"] }]);
  equal(together[0].endsAt, "2026-11-13T02:30:00.000Z");
  rejects(() => planVisits(["breakfast", "lunch"], [{ id: "a", chefId: "chef", startsAt: at("06:00"), meals: ["breakfast"] }]));
  rejects(() => cookingMinutes(["breakfast", "breakfast"]));
  rejects(() => planVisits(["breakfast", "lunch"], [
    { id: "a", chefId: "chef", startsAt: at("06:00"), meals: ["breakfast"] },
    { id: "b", chefId: "chef", startsAt: at("06:30"), meals: ["lunch"] },
  ]));
});
Deno.test("cooking and travel conflicts work across meal labels and both boundaries", () => {
  const existing = [booked("early", "06:00", "08:00"), booked("later", "10:00", "11:00")];
  equal(visitConflicts(visit("new", "08:00", "09:00"), existing, at("05:00")), [{ reservationId: "early", reason: "travel_buffer" }]);
  equal(visitConflicts(visit("new", "09:00", "10:00"), existing, at("05:00")), [{ reservationId: "later", reason: "travel_buffer" }]);
  equal(visitConflicts(visit("new", "09:00", "10:00"), existing.slice(0, 1), at("05:00")), []);
  equal(visitConflicts(visit("new", "07:00", "09:00"), existing, at("05:00")), [{ reservationId: "early", reason: "cooking_overlap" }]);
});
Deno.test("early finish releases actual time but only a server-approved building match shortens travel", () => {
  const completed: Reservation = { ...booked("old", "06:00", "07:00"), status: "completed", actualEndedAt: at("06:40"), buildingId: "towerA" };
  const next = { ...visit("next", "07:00", "08:00"), buildingId: "towerA" };
  equal(visitConflicts(next, [completed], at("06:45"))[0].reason, "travel_buffer");
  equal(visitConflicts({ ...next, startsAt: at("07:40"), endsAt: at("08:40") }, [completed], at("06:45")), []);
  const approval = { beforeVisitId: "old", afterVisitId: "next", buildingId: "towerA", minutes: 15, approvedBy: "ops" };
  equal(visitConflicts(next, [completed], at("06:45"), [approval]), []);
  rejects(() => visitConflicts({ ...next, buildingId: "towerB" }, [completed], at("06:45"), [approval]));
  rejects(() => visitConflicts(next, [completed], at("06:45"), [{ ...approval, approvedBy: "" }]));
});
Deno.test("active holds and overruns block; expired holds and other chefs do not", () => {
  const candidate = visit("new", "08:00", "09:00");
  const hold: Reservation = { ...booked("hold", "08:00", "09:00"), status: "held", holdExpiresAt: at("07:59") };
  equal(visitConflicts(candidate, [hold], at("07:59")), []);
  equal(visitConflicts(candidate, [{ ...hold, holdExpiresAt: at("08:01") }], at("07:59"))[0].reason, "cooking_overlap");
  equal(visitConflicts(candidate, [{ ...booked("active", "06:00", "07:00"), status: "in_progress" }], at("07:59"))[0].reason, "overrun");
  equal(visitConflicts(candidate, [{ ...hold, chefId: "other" }], at("07:00")), []);
  rejects(() => visitConflicts(candidate, [hold], at("09:00")));
  rejects(() => visitConflicts({ ...candidate, startsAt: "2026-11-13T08:00:00" }, [], at("07:00")));
});
Deno.test("weeks anchor to subscription start, clip at expiry and handle year boundaries", () => {
  equal(subscriptionMenuWindow("2026-11-12", "2026-12-11", "2026-11-18"), { weekIndex: 0, startDate: "2026-11-12", endDate: "2026-11-18", dayIndex: 6 });
  equal(subscriptionMenuWindow("2026-11-12", "2026-12-11", "2026-11-19"), { weekIndex: 1, startDate: "2026-11-19", endDate: "2026-11-25", dayIndex: 0 });
  equal(subscriptionMenuWindow("2026-11-12", "2026-12-11", "2026-12-11").endDate, "2026-12-11");
  equal(subscriptionMenuWindow("2026-12-30", "2027-01-05", "2027-01-01").dayIndex, 2);
  rejects(() => subscriptionMenuWindow("2026-11-12", "2026-11-18", "2026-11-19"));
  rejects(() => subscriptionMenuWindow("2026-02-30", "2026-03-07", "2026-03-01"));
});
