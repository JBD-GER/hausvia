import assert from "node:assert/strict";
import test from "node:test";

const {
  chatCalendarDay,
  chatInitials,
  chatMessageTime,
  chatRoleLabel,
  chatSenderName,
} = await import("./portal/chatPresentation.ts");

test("zeigt die drei Gruppenchat-Rollen mit kundenfreundlichen Namen", () => {
  assert.equal(chatRoleLabel("admin"), "Hausvia");
  assert.equal(chatRoleLabel("employee"), "Mitarbeiter");
  assert.equal(chatRoleLabel("customer"), "Kunde");
});

test("verbirgt den persönlichen Adminnamen hinter der Marke Hausvia", () => {
  assert.equal(
    chatSenderName({
      displayName: "Interner Adminname",
      role: "admin",
      isCurrentUser: false,
    }),
    "Hausvia",
  );
  assert.equal(
    chatSenderName({
      displayName: "Interner Adminname",
      role: "admin",
      isCurrentUser: true,
    }),
    "Sie",
  );
});

test("erzeugt verständliche Avatare und stabile Tagesgruppen", () => {
  assert.equal(chatInitials("Christoph Pfad", "customer"), "CP");
  assert.equal(chatInitials("Beliebiger Name", "admin"), "HV");
  assert.equal(
    chatCalendarDay("2026-08-06T08:15:00+02:00"),
    chatCalendarDay("2026-08-06T22:45:00+02:00"),
  );
  assert.notEqual(
    chatCalendarDay("2026-08-06T22:45:00+02:00"),
    chatCalendarDay("2026-08-07T08:15:00+02:00"),
  );
});

test("zeigt in der Sprechblase nur die Uhrzeit", () => {
  assert.match(chatMessageTime("2026-08-06T14:45:00+02:00"), /^14:45$/);
});
