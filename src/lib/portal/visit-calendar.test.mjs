import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  addCalendarMonths,
  buildVisitCalendarHref,
  calendarDayVisitId,
  calendarDatesBetween,
  calendarDayNumber,
  calendarMonthNumber,
  calendarWeekdayIndex,
  calendarWeekdayLabel,
  endOfCalendarWeek,
  formatVisitCalendarFullDate,
  formatVisitCalendarTitle,
  getMonthCalendarRange,
  getVisitCalendarRange,
  getWeekCalendarRange,
  isCalendarDate,
  isCalendarDateInRange,
  isSameCalendarMonth,
  normalizeCalendarDate,
  normalizeVisitCalendarView,
  shiftVisitCalendarDate,
  startOfCalendarWeek,
} from "./visitCalendar.ts";

test("validiert Date-only-Werte einschließlich Schaltjahren streng", () => {
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2027-02-29"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-04-31"), false);
  assert.equal(isCalendarDate("06.08.2026"), false);
  assert.equal(isCalendarDate(null), false);
  assert.equal(normalizeCalendarDate(" 2026-08-06 ", "2026-01-01"), "2026-08-06");
  assert.equal(normalizeCalendarDate("ungültig", "2026-01-01"), "2026-01-01");
  assert.throws(
    () => normalizeCalendarDate("ungültig", "auch ungültig"),
    /Ersatzdatum/,
  );
});

test("berechnet Wochen immer von Montag bis Sonntag", () => {
  assert.equal(calendarWeekdayIndex("2026-08-03"), 0);
  assert.equal(calendarWeekdayIndex("2026-08-09"), 6);
  assert.equal(startOfCalendarWeek("2026-08-06"), "2026-08-03");
  assert.equal(endOfCalendarWeek("2026-08-06"), "2026-08-09");
  assert.deepEqual(getWeekCalendarRange("2026-08-09"), {
    start: "2026-08-03",
    end: "2026-08-09",
  });
  assert.deepEqual(getWeekCalendarRange("2026-01-01"), {
    start: "2025-12-29",
    end: "2026-01-04",
  });
});

test("liefert für Monate ein stabiles 42-Tage-Raster mit Randtagen", () => {
  assert.deepEqual(getMonthCalendarRange("2026-08-17"), {
    start: "2026-07-27",
    end: "2026-09-06",
  });
  assert.deepEqual(getMonthCalendarRange("2026-01-03"), {
    start: "2025-12-29",
    end: "2026-02-08",
  });
  assert.deepEqual(getVisitCalendarRange("month", "2028-02-29"), {
    start: "2028-01-31",
    end: "2028-03-12",
  });
  assert.deepEqual(getVisitCalendarRange("week", "2028-02-29"), {
    start: "2028-02-28",
    end: "2028-03-05",
  });
});

test("verschiebt Tage und Monate ohne Zeitzonen- oder Monatsende-Fehler", () => {
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addCalendarDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addCalendarMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addCalendarMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(addCalendarMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addCalendarMonths("2026-12-31", 2), "2027-02-28");
  assert.throws(() => addCalendarDays("2026-08-06", 1.5), /ganze Zahl/);
  assert.throws(() => addCalendarMonths("kaputt", 1), /Kalenderdatum/);
});

test("navigiert Monats- und Wochenansichten in passenden Schritten", () => {
  assert.equal(
    shiftVisitCalendarDate("2026-08-31", "month", 1),
    "2026-09-30",
  );
  assert.equal(
    shiftVisitCalendarDate("2026-08-06", "month", -2),
    "2026-06-06",
  );
  assert.equal(
    shiftVisitCalendarDate("2026-08-06", "week", 1),
    "2026-08-13",
  );
  assert.equal(
    shiftVisitCalendarDate("2026-01-01", "week", -1),
    "2025-12-25",
  );
});

test("formatiert deutsche Monats-, Wochen- und Tagesbezeichnungen", () => {
  assert.equal(formatVisitCalendarTitle("2026-08-06", "month"), "August 2026");
  assert.equal(
    formatVisitCalendarTitle("2026-08-06", "week"),
    "3.–9. August 2026",
  );
  assert.equal(
    formatVisitCalendarTitle("2026-09-01", "week"),
    "31. August – 6. September 2026",
  );
  assert.equal(
    formatVisitCalendarTitle("2027-01-01", "week"),
    "28. Dezember 2026 – 3. Januar 2027",
  );
  assert.equal(
    formatVisitCalendarFullDate("2026-08-06"),
    "Donnerstag, 6. August 2026",
  );
  assert.equal(calendarWeekdayLabel("2026-08-06"), "Do");
  assert.equal(calendarWeekdayLabel("2026-08-06", "long"), "Donnerstag");
  assert.equal(calendarDayNumber("2026-08-06"), 6);
  assert.equal(calendarMonthNumber("2026-08-06"), 8);
});

test("enumeriert inklusive Zeiträume und schützt vor falscher Reihenfolge", () => {
  assert.deepEqual(calendarDatesBetween("2026-08-03", "2026-08-09"), [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]);
  assert.deepEqual(calendarDatesBetween("2026-08-06", "2026-08-06"), [
    "2026-08-06",
  ]);
  assert.throws(
    () => calendarDatesBetween("2026-08-07", "2026-08-06"),
    /Enddatum/,
  );
});

test("vergleicht Monate und sichtbare Bereiche als Date-only-Werte", () => {
  const range = { start: "2026-08-03", end: "2026-08-09" };
  assert.equal(isCalendarDateInRange("2026-08-03", range), true);
  assert.equal(isCalendarDateInRange("2026-08-09", range), true);
  assert.equal(isCalendarDateInRange("2026-08-10", range), false);
  assert.equal(isSameCalendarMonth("2026-08-01", "2026-08-31"), true);
  assert.equal(isSameCalendarMonth("2026-08-31", "2026-09-01"), false);
});

test("normalisiert unbekannte Ansichten auf den Monat", () => {
  assert.equal(normalizeVisitCalendarView("week"), "week");
  assert.equal(normalizeVisitCalendarView("month"), "month");
  assert.equal(normalizeVisitCalendarView("agenda"), "month");
  assert.equal(normalizeVisitCalendarView(undefined), "month");
});

test("öffnet einen Kalendertag nur bei genau einem Termin direkt", () => {
  assert.equal(calendarDayVisitId([]), null);
  assert.equal(calendarDayVisitId([{ id: " einsatz-1 " }]), "einsatz-1");
  assert.equal(
    calendarDayVisitId([{ id: "einsatz-1" }, { id: "einsatz-2" }]),
    null,
  );
  assert.equal(calendarDayVisitId([{ id: "   " }]), null);
});

test("baut interne Kalenderlinks, bewahrt Kontext und entfernt alte Meldungen", () => {
  const href = buildVisitCalendarHref({
    baseHref:
      "/admin/properties/haus-1?metricsMonth=2026-08&status=Gespeichert&error=Alt#einsaetze",
    view: "week",
    calendarDate: "2026-08-06",
    visitId: "einsatz 7",
  });
  const [urlWithQuery, fragment] = href.split("#");
  const [pathname, queryString] = urlWithQuery.split("?");
  const query = new URLSearchParams(queryString);

  assert.equal(pathname, "/admin/properties/haus-1");
  assert.equal(fragment, "einsaetze");
  assert.equal(query.get("metricsMonth"), "2026-08");
  assert.equal(query.get("view"), "einsaetze");
  assert.equal(query.get("calendarView"), "week");
  assert.equal(query.get("calendarDate"), "2026-08-06");
  assert.equal(query.get("visit"), "einsatz 7");
  assert.equal(query.has("status"), false);
  assert.equal(query.has("error"), false);

  const deselectedHref = buildVisitCalendarHref({
    baseHref: "/admin/properties/haus-1?visit=alt",
    view: "month",
    calendarDate: "2026-09-01",
  });
  assert.equal(new URL(deselectedHref, "https://hausvia.test").searchParams.has("visit"), false);
  assert.throws(
    () =>
      buildVisitCalendarHref({
        baseHref: "",
        view: "month",
        calendarDate: "2026-09-01",
      }),
    /Zielpfad/,
  );
});
