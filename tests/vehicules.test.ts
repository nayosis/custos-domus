import { describe, expect, test } from "bun:test";
import { calculerRappels, composer } from "../serveur/rappels";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { dateAuKm, echeanceAuPremier, libelleRythme, rythmeKm } from "../src/lib/vehicules";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const erreur = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  return { statut: r.status, message: (await r.json()).erreur as string };
};
const jour = aujourdhui();
const entretienDe = async (vehicule: string, id: string) => (await ok("ficheElement", vehicule)).entretiens.find((e: { id: string }) => e.id === id);

describe("règles du kilométrage", () => {
  const releves = [
    { date: "2026-01-01", km: 80000 },
    { date: "2026-03-02", km: 82400 }, // 60 jours, 2 400 km : 40 km par jour
  ];
  test("rythme, date estimée, au premier atteint", () => {
    expect(rythmeKm(releves)).toBe(40);
    expect(libelleRythme(40).replace(/\s/g, " ")).toBe("~1 200 km par mois");
    expect(rythmeKm([{ date: "2026-03-01", km: 82000 }, releves[1]])).toBeNull(); // relevés trop rapprochés
    expect(dateAuKm(84400, releves)).toBe("2026-04-21"); // 2 000 km à 40 km par jour : 50 jours
    expect(dateAuKm(82000, releves)).toBe("2026-03-02"); // déjà dépassé : le jour du relevé
    expect(dateAuKm(90000, [releves[0]])).toBeNull();
    expect(echeanceAuPremier("2026-06-01", "2026-04-21")).toBe("2026-04-21");
    expect(echeanceAuPremier(null, "2026-04-21")).toBe("2026-04-21");
    expect(echeanceAuPremier("2026-06-01", null)).toBe("2026-06-01");
  });
});

describe("véhicules", () => {
  test("création avec le kilométrage actuel ; à part des équipements ; fiche sans maison", async () => {
    const v = await ok("creerVehicule", { nom: "Clio", immatriculation: "ab-123-cd", km: 84000, dateMiseEnService: "15/03/2019" });
    const liste = await ok("listeVehicules");
    expect(liste.find((x: { id: string }) => x.id === v)).toMatchObject({ nom: "Clio", immatriculation: "AB-123-CD", type: "vehicule", maisonId: null, dernierReleve: { date: jour, km: 84000 } });
    expect((await ok("listeElements")).some((e: { id: string }) => e.id === v)).toBe(false);
    const fiche = await ok("ficheElement", v);
    expect(fiche.maison).toBeNull();
    expect(fiche.releves).toHaveLength(1);
    // Le type ne change pas après coup.
    await ok("majElement", v, { type: "equipement", nom: "Clio V" }, fiche.element.modifieLe);
    expect((await ok("ficheElement", v)).element).toMatchObject({ type: "vehicule", nom: "Clio V" });
  });

  test("relevés : le compteur ne recule pas ; un relevé identique n'est pas répété", async () => {
    const v = await ok("creerVehicule", { nom: "Kangoo", km: 50000 });
    await ok("releverCompteur", v, { km: 49000, date: ajouter(jour, -30, "jour") });
    expect((await erreur("releverCompteur", v, { km: 48000 })).message.replace(/\s/g, " ")).toContain("50 000 km");
    expect((await erreur("releverCompteur", v, { km: 51000, date: ajouter(jour, -60, "jour") })).statut).toBe(400);
    await ok("releverCompteur", v, { km: 50000 });
    expect((await ok("ficheElement", v)).releves).toHaveLength(2);
  });

  test("entretien « 1 an ou 15 000 km » : échéance au premier atteint, d'après le rythme des relevés", async () => {
    const v = await ok("creerVehicule", { nom: "Zoé", km: 84000 });
    await ok("releverCompteur", v, { km: 82800, date: ajouter(jour, -30, "jour") }); // 40 km par jour
    const id = await ok("creerEntretien", {
      elementId: v,
      titre: "Vidange",
      avecRdv: true,
      intervalleValeur: 1,
      intervalleUnite: "an",
      intervalleKm: 15000,
      derniereRealisation: ajouter(jour, -2, "mois"),
      kmDerniere: 80000,
    });
    let e = await entretienDe(v, id);
    const ilYA2Mois = ajouter(jour, -2, "mois");
    expect(e).toMatchObject({ kmEcheance: 95000, echeanceTemps: ajouter(ilYA2Mois, 1, "an") });
    // Le kilométrage de la dernière fois compte comme un relevé : 4 000 km depuis, soit environ 65 km par jour ;
    // il reste 11 000 km, atteints bien avant l'échéance au temps.
    const parJour = 4000 / ((Date.parse(jour) - Date.parse(ilYA2Mois)) / 86_400_000);
    expect(e.echeance).toBe(ajouter(jour, Math.ceil(11000 / parJour), "jour"));
    expect(e.echeance < e.echeanceTemps).toBe(true);

    // On roule plus : l'échéance se rapproche.
    const avant = e.echeance;
    await ok("releverCompteur", v, { km: 87000 });
    e = await entretienDe(v, id);
    expect(e.echeance < avant).toBe(true);

    // Faite à 87 500 km : prochaine à 102 500 km ou dans un an ; le kilométrage devient un relevé.
    await ok("realiserEntretien", id, { date: jour, km: 87500, cout: 180 });
    e = await entretienDe(v, id);
    expect(e).toMatchObject({ kmEcheance: 102500, echeanceTemps: ajouter(jour, 1, "an"), actif: true });
    const fiche = await ok("ficheElement", v);
    expect(fiche.historique[0]).toMatchObject({ kilometrage: 87500, cout: 180 });
    expect(fiche.releves.some((r: { km: number }) => r.km === 87500)).toBe(true);

    // Passer : un intervalle plus loin, au compteur comme au calendrier.
    await ok("passerEcheance", id);
    expect((await entretienDe(v, id)).kmEcheance).toBe(117500);
  });

  test("au kilométrage seulement ; refusé hors véhicule", async () => {
    const v = await ok("creerVehicule", { nom: "Twingo", km: 10000 });
    const id = await ok("creerEntretien", { elementId: v, titre: "Pneus", intervalleKm: 40000 });
    // Pas encore de rythme : provisoirement dans un an, en attendant des relevés.
    expect(await entretienDe(v, id)).toMatchObject({ kmEcheance: 50000, echeanceTemps: null, echeance: ajouter(jour, 1, "an") });
    await ok("releverCompteur", v, { km: 9000, date: ajouter(jour, -100, "jour") }); // 10 km par jour
    expect((await entretienDe(v, id)).echeance).toBe(ajouter(jour, 4000, "jour"));
    // Fait : reste actif (récurrent au kilométrage), même sans intervalle de temps.
    await ok("realiserEntretien", id, { km: 10500 });
    expect(await entretienDe(v, id)).toMatchObject({ actif: true, kmEcheance: 50500 });

    const maison = await ok("creerMaison", { nom: "Maison" });
    const el = await ok("creerElement", { maisonId: maison, nom: "Tondeuse" });
    expect((await erreur("creerEntretien", { elementId: el, titre: "Vidange", intervalleKm: 1000 })).statut).toBe(400);
    expect((await erreur("realiserEntretien", await ok("creerEntretien", { maisonId: maison, titre: "Tondre" }), { km: 100 })).statut).toBe(400);
  });

  test("tableau de bord : les véhicules apparaissent quand on regarde toutes les maisons", async () => {
    const v = await ok("creerVehicule", { nom: "Utilitaire", km: 1000 });
    const id = await ok("creerEntretien", { elementId: v, titre: "Contrôle technique", avecRdv: true, intervalleValeur: 2, intervalleUnite: "an", echeance: jour });
    await ok("creerRealisation", { elementId: v, titre: "Batterie changée", date: jour, cout: 110, kilometrage: 1200 });
    const tout = await ok("tableauDeBord");
    expect(tout.entretiens.find((e: { id: string }) => e.id === id)).toMatchObject({ elementNom: "Utilitaire", maisonNom: null });
    expect(tout.dernieres.some((r: { titre: string }) => r.titre === "Batterie changée")).toBe(true);
    const maison = await ok("creerMaison", { nom: "Une maison" });
    expect((await ok("tableauDeBord", maison)).entretiens.some((e: { id: string }) => e.id === id)).toBe(false);
    expect((await ok("ficheElement", v)).releves.map((r: { km: number }) => r.km)).toContain(1200);
  });
});

describe("relevé mensuel", () => {
  const suivi = (dernierReleve: string | null) => ({ entretiens: [], garanties: [], vehicules: [{ id: "v", nom: "Clio", dernierReleve }] });

  test("demandé le 1er du mois, relancé le 4 si rien depuis le 1er", async () => {
    expect((await calculerRappels("2026-12-01", "2026-11-30", { suivi: suivi("2026-11-02") })).alertes).toMatchObject([{ type: "releve", relance: false }]);
    expect((await calculerRappels("2026-12-02", "2026-12-01", { suivi: suivi("2026-11-02") })).alertes).toEqual([]);
    expect((await calculerRappels("2026-12-04", "2026-12-03", { suivi: suivi("2026-11-02") })).alertes).toMatchObject([{ type: "releve", relance: true }]);
    expect((await calculerRappels("2026-12-04", "2026-12-03", { suivi: suivi("2026-12-02") })).alertes).toEqual([]);
  });

  test("la notification ouvre directement la saisie", async () => {
    const r = await calculerRappels("2026-12-01", "2026-11-30", { suivi: suivi(null) });
    const m = composer(r, "")!;
    expect(m.sujet).toBe("Relevé du compteur");
    expect(m.push.url).toBe("/elements/v?releve=1");
  });
});
