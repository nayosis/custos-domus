import { describe, expect, test } from "bun:test";
import { occurrences } from "../src/lib/entretiens";

const base = { intervalleValeur: null as number | null, intervalleUnite: null as string | null, ancrage: "realisation", echeanceInitiale: null as string | null, etat: "a_faire", dateRdv: null as string | null };
const dates = (o: { date: string; suivante: boolean }[]) => o.map((x) => `${x.date}${x.suivante ? "*" : ""}`);

describe("vue chronologique : les fois prévues", () => {
  test("tâche : une seule fois ; rendez-vous pris : à sa date", () => {
    expect(dates(occurrences({ ...base, echeance: "2026-11-20" }, "2026-11-14", "2026-12-31"))).toEqual(["2026-11-20"]);
    expect(dates(occurrences({ ...base, echeance: "2026-11-07", etat: "rdv_pris", dateRdv: "2026-11-16" }, "2026-11-14", "2026-12-31"))).toEqual(["2026-11-16"]);
  });

  test("routine à date fixe : les suivantes au même rythme, jusqu'à la fin incluse", () => {
    const poubelle = { ...base, intervalleValeur: 1, intervalleUnite: "semaine", ancrage: "fixe", echeance: "2026-11-16" };
    expect(dates(occurrences(poubelle, "2026-11-14", "2026-12-07"))).toEqual(["2026-11-16", "2026-11-23*", "2026-11-30*", "2026-12-07*"]);
    // Reportée : le rythme repart de la date d'origine.
    expect(dates(occurrences({ ...poubelle, echeance: "2026-11-18", echeanceInitiale: "2026-11-16" }, "2026-11-14", "2026-11-30"))).toEqual(["2026-11-18", "2026-11-23*", "2026-11-30*"]);
  });

  test("en retard : la suivante compte depuis aujourd'hui (depuis la dernière fois) ou garde le calendrier (date fixe)", () => {
    const pneus = { ...base, intervalleValeur: 3, intervalleUnite: "mois", echeance: "2026-11-09" };
    expect(dates(occurrences(pneus, "2026-11-14", "2027-05-31"))).toEqual(["2026-11-09", "2027-02-14*", "2027-05-14*"]);
    const fixe = { ...base, intervalleValeur: 1, intervalleUnite: "semaine", ancrage: "fixe", echeance: "2026-11-02" };
    expect(dates(occurrences(fixe, "2026-11-14", "2026-11-23"))).toEqual(["2026-11-02", "2026-11-16*", "2026-11-23*"]);
  });
});
