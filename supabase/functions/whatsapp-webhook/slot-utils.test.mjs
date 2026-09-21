import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cdmxLocalToIso,
  parseCitaChoice,
  parseSlotSelection,
  proposeAvailableSlots,
  rangesOverlap,
  wantsAgendarKeyword,
} from "./slot-utils.js";

const DISP = [1, 2, 3, 4, 5, 6].map((dia) => ({
  dia_semana: dia,
  hora_inicio: "08:00:00",
  hora_fin: "20:00:00",
  duracion_slot_min: 60,
  activo: true,
}));

describe("rangesOverlap (EXCLUDE-style [))", () => {
  it("detects overlap", () => {
    const a = cdmxLocalToIso("2026-09-21", "10:00");
    const b = cdmxLocalToIso("2026-09-21", "10:30");
    assert.equal(rangesOverlap(a, 60, b, 60), true);
  });
  it("allows adjacent slots", () => {
    const a = cdmxLocalToIso("2026-09-21", "10:00");
    const b = cdmxLocalToIso("2026-09-21", "11:00");
    assert.equal(rangesOverlap(a, 60, b, 60), false);
  });
});

describe("proposeAvailableSlots", () => {
  it("skips occupied and Sunday, returns up to 3", () => {
    // Monday 2026-09-21 07:00 CDMX
    const now = new Date(cdmxLocalToIso("2026-09-21", "07:00"));
    const ocupadas = [
      { fecha_hora: cdmxLocalToIso("2026-09-21", "08:00"), duracion_min: 60 },
      { fecha_hora: cdmxLocalToIso("2026-09-21", "09:00"), duracion_min: 60 },
    ];
    const slots = proposeAvailableSlots(DISP, ocupadas, { now, count: 3 });
    assert.equal(slots.length, 3);
    assert.equal(slots[0].iso, cdmxLocalToIso("2026-09-21", "10:00"));
    assert.equal(slots[1].iso, cdmxLocalToIso("2026-09-21", "11:00"));
    assert.equal(slots[2].iso, cdmxLocalToIso("2026-09-21", "12:00"));
  });

  it("never invents Sunday slots", () => {
    const now = new Date(cdmxLocalToIso("2026-09-20", "10:00")); // Sunday
    const slots = proposeAvailableSlots(DISP, [], { now, count: 2, daysAhead: 2 });
    assert.equal(slots[0].iso, cdmxLocalToIso("2026-09-21", "08:00"));
    assert.equal(slots[1].iso, cdmxLocalToIso("2026-09-21", "09:00"));
  });
});

describe("parseCitaChoice / keywords", () => {
  it("maps buttons and keywords", () => {
    assert.equal(parseCitaChoice("", "agendar_visita"), "agendar");
    assert.equal(parseCitaChoice("", "solo_cotizacion"), "solo_cotizacion");
    assert.equal(parseCitaChoice("Quiero agendar una visita"), "agendar");
    assert.equal(parseCitaChoice("solo cotización"), "solo_cotizacion");
    assert.equal(parseCitaChoice("2"), "agendar");
    assert.equal(parseCitaChoice("1"), "solo_cotizacion");
    assert.equal(wantsAgendarKeyword("cita"), true);
    assert.equal(wantsAgendarKeyword("hola"), false);
  });
});

describe("parseSlotSelection", () => {
  const proposed = [
    { iso: cdmxLocalToIso("2026-09-21", "10:00"), label: "lun 21 sept 10:00" },
    { iso: cdmxLocalToIso("2026-09-21", "11:00"), label: "lun 21 sept 11:00" },
    { iso: cdmxLocalToIso("2026-09-21", "12:00"), label: "lun 21 sept 12:00" },
  ];
  it("accepts index, button id, and time", () => {
    assert.equal(parseSlotSelection("2", "", proposed), 1);
    assert.equal(parseSlotSelection("", "slot_3", proposed), 2);
    assert.equal(parseSlotSelection("10:00", "", proposed), 0);
    assert.equal(parseSlotSelection("nope", "", proposed), -1);
  });
});
