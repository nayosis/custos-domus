import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cheminFichier } from "../serveur/fichiers";
import { ajouter, libelleDelai, libelleIntervalle, prochaineEcheance, situation } from "../src/lib/entretiens";
import { aujourdhui } from "../src/lib/dates";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

/** Appel RPC qui doit réussir ; renvoie le résultat. */
const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const nouvelElement = async (nom = "Pompe à chaleur") => {
  const maison = await ok("creerMaison", { nom: "Maison" });
  return ok("creerElement", { maisonId: maison, nom });
};
const entretienDe = async (elementId: string, id: string) => (await ok("ficheElement", elementId)).entretiens.find((e: { id: string }) => e.id === id);

describe("règles des échéances", () => {
  test("ajout d'un intervalle ; fins de mois", () => {
    expect(ajouter("2026-03-14", 4, "an")).toBe("2030-03-14");
    expect(ajouter("2026-01-31", 1, "mois")).toBe("2026-02-28");
    expect(ajouter("2028-02-29", 1, "an")).toBe("2029-02-28");
    expect(ajouter("2026-12-30", 3, "jour")).toBe("2027-01-02");
  });

  test("prochaine échéance : depuis la réalisation, ou à date fixe sans échéances passées", () => {
    const pac = { intervalleValeur: 1, intervalleUnite: "an", echeance: "2026-10-01" };
    expect(prochaineEcheance({ ...pac, ancrage: "realisation" }, "2026-11-15")).toBe("2027-11-15");
    expect(prochaineEcheance({ ...pac, ancrage: "fixe" }, "2026-11-15")).toBe("2027-10-01");
    expect(prochaineEcheance({ ...pac, ancrage: "fixe" }, "2028-01-10")).toBe("2028-10-01");
    expect(prochaineEcheance({ intervalleValeur: null, intervalleUnite: null, ancrage: "realisation", echeance: "2026-10-01" }, "2026-10-02")).toBeNull();
  });

  test("situation : en retard, fenêtre d'alerte ouverte, à venir, rdv pris", () => {
    const e = { actif: true, etat: "a_faire", dateRdv: null, echeance: "2026-12-01", delaiAlerteJours: 42 };
    expect(situation(e, "2026-10-01")).toEqual({ etat: "a_venir", jours: 61 });
    expect(situation(e, "2026-10-27")).toEqual({ etat: "a_prevoir", jours: 35 });
    expect(situation(e, "2026-12-05")).toEqual({ etat: "en_retard", jours: 4 });
    expect(situation({ ...e, etat: "rdv_pris", dateRdv: "2026-11-20" }, "2026-11-19")).toEqual({ etat: "rdv_pris", dateRdv: "2026-11-20", jours: 1 });
    expect(situation({ ...e, actif: false }, "2026-12-05")).toEqual({ etat: "inactif" });
  });

  test("libellés", () => {
    expect(libelleIntervalle({ intervalleValeur: 4, intervalleUnite: "an" })).toBe("tous les 4 ans");
    expect(libelleIntervalle({ intervalleValeur: 1, intervalleUnite: "an" })).toBe("chaque année");
    expect(libelleIntervalle({ intervalleValeur: null, intervalleUnite: null })).toBe("une fois");
    expect(libelleDelai(42)).toBe("6 semaines");
    expect(libelleDelai(10)).toBe("10 jours");
  });
});

describe("entretiens", () => {
  test("bibliothèque de modèles installée par migration", async () => {
    const modeles = await ok("listeModeles");
    expect(modeles.length).toBeGreaterThan(15);
    expect(modeles.find((m: { id: string }) => m.id === "modele-fosse-septique")).toMatchObject({ nature: "rdv", intervalleValeur: 4, intervalleUnite: "an", delaiAlerteJours: 42 });
  });

  test("création avec dernière réalisation : échéance calculée, réalisation consignée, délai par défaut", async () => {
    const el = await nouvelElement("Fosse septique");
    const id = await ok("creerEntretien", { elementId: el, titre: "Vidange", nature: "rdv", intervalleValeur: 4, intervalleUnite: "an", derniereRealisation: "2024-06-10" });
    const fiche = await ok("ficheElement", el);
    expect(fiche.entretiens[0]).toMatchObject({ id, echeance: "2028-06-10", delaiAlerteJours: 42, etat: "a_faire", actif: true });
    expect(fiche.historique).toHaveLength(1);
    expect(fiche.historique[0]).toMatchObject({ entretienId: id, date: "2024-06-10", titre: "Vidange" });

    const tache = await ok("creerEntretien", { elementId: el, titre: "Contrôle du niveau", intervalleValeur: 1, intervalleUnite: "an" });
    expect(await entretienDe(el, tache)).toMatchObject({ nature: "tache", delaiAlerteJours: 7, echeance: aujourdhui() });

    expect((await s.rpc("creerEntretien", [{ elementId: el, titre: " " }], cookie)).status).toBe(400);
    expect((await s.rpc("creerEntretien", [{ elementId: el, titre: "x", nature: "autre" }], cookie)).status).toBe(400);
    expect((await s.rpc("creerEntretien", [{ elementId: el, titre: "x", echeance: "32/01/2026" }], cookie)).status).toBe(400);
  });

  test("flux rendez-vous : à prendre → rdv pris → fait ; échéance suivante depuis la date réelle", async () => {
    const el = await nouvelElement();
    const presta = await ok("creerPrestataire", { nom: "Chauffage Martin" });
    const id = await ok("creerEntretien", { elementId: el, titre: "Entretien PAC", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: "2026-11-01" });

    await ok("prendreRdv", id, { dateRdv: "2026-11-18", prestataireId: presta });
    expect(await entretienDe(el, id)).toMatchObject({ etat: "rdv_pris", dateRdv: "2026-11-18", prestataireNom: "Chauffage Martin" });
    await ok("annulerRdv", id);
    expect(await entretienDe(el, id)).toMatchObject({ etat: "a_faire", dateRdv: null });
    await ok("prendreRdv", id, { dateRdv: "2026-11-20" });

    const realisation = await ok("realiserEntretien", id, { date: "2026-11-20", note: "Pression OK, filtre nettoyé", cout: 180 });
    const fiche = await ok("ficheElement", el);
    expect(fiche.entretiens[0]).toMatchObject({ etat: "a_faire", dateRdv: null, echeance: "2027-11-20", actif: true });
    // Le prestataire de l'entretien est repris par défaut.
    expect(fiche.historique[0]).toMatchObject({ id: realisation, titre: "Entretien PAC", cout: 180, note: "Pression OK, filtre nettoyé", prestataireNom: "Chauffage Martin" });
  });

  test("entretien ponctuel : clos une fois fait ; échéance fixe", async () => {
    const el = await nouvelElement();
    const ponctuel = await ok("creerEntretien", { elementId: el, titre: "Remplacer le joint", echeance: "2026-11-05" });
    await ok("realiserEntretien", ponctuel, { date: "2026-11-03" });
    expect(await entretienDe(el, ponctuel)).toMatchObject({ actif: false, echeance: "2026-11-05" });

    const fixe = await ok("creerEntretien", { elementId: el, titre: "Ramonage", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", ancrage: "fixe", echeance: "2026-10-01" });
    await ok("realiserEntretien", fixe, { date: "2026-10-20" });
    expect((await entretienDe(el, fixe)).echeance).toBe("2027-10-01");
  });

  test("modification ; suppression qui garde l'historique", async () => {
    const el = await nouvelElement();
    const id = await ok("creerEntretien", { elementId: el, titre: "Nettoyage", intervalleValeur: 6, intervalleUnite: "mois", echeance: "2026-12-01" });
    await ok("majEntretien", id, { intervalleValeur: null, intervalleUnite: null, delaiAlerteJours: 14, notes: "  " });
    expect(await entretienDe(el, id)).toMatchObject({ intervalleValeur: null, intervalleUnite: null, delaiAlerteJours: 14, notes: null });
    await ok("realiserEntretien", id, { date: "2026-11-30" });
    await ok("supprimerEntretien", id);
    const fiche = await ok("ficheElement", el);
    expect(fiche.entretiens).toEqual([]);
    expect(fiche.historique[0]).toMatchObject({ titre: "Nettoyage", entretienId: null });
  });
});

describe("réalisations", () => {
  test("réparation consignée, pièce jointe, suppression avec ses fichiers", async () => {
    const el = await nouvelElement("Lave-linge");
    const id = await ok("creerRealisation", { elementId: el, date: "2026-09-02", titre: "Changement de la pompe de vidange", cout: 89.9 });
    const f = new FormData();
    f.append("fichier", new File([new Uint8Array([37, 80, 68, 70])], "facture réparation.pdf", { type: "application/pdf" }));
    const envoi = await (await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-custos": "1", cookie } }))).json();
    await ok("creerDocument", { realisationId: id, fichier: envoi.fichier, nom: envoi.nom });

    let fiche = await ok("ficheElement", el);
    expect(fiche.historique[0]).toMatchObject({ id, entretienId: null, cout: 89.9 });
    expect(fiche.historique[0].documents).toHaveLength(1);
    expect(fiche.documents).toEqual([]);

    await ok("majRealisation", id, { note: "Garantie pièce 1 an" });
    expect((await s.rpc("majRealisation", [id, { cout: -5 }], cookie)).status).toBe(400);
    await ok("supprimerRealisation", id);
    fiche = await ok("ficheElement", el);
    expect(fiche.historique).toEqual([]);
    expect(existsSync(cheminFichier(envoi.fichier))).toBe(false);
  });
});

describe("remplacement", () => {
  test("l'ancien est archivé avec son historique ; les entretiens repartent de la mise en service du nouveau", async () => {
    const maison = await ok("creerMaison", { nom: "Maison" });
    const ancien = await ok("creerElement", { maisonId: maison, nom: "Chaudière fioul", categorie: "Chauffage et climatisation", emplacement: "Cellier" });
    const e = await ok("creerEntretien", { elementId: ancien, titre: "Entretien annuel", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: "2026-11-01" });
    await ok("realiserEntretien", e, { date: "2025-11-01" });

    const nouveau = await ok("remplacerElement", ancien, { nom: "Pompe à chaleur", dateMiseEnService: "2026-10-15" }, true);
    const ficheAncien = await ok("ficheElement", ancien);
    expect(ficheAncien.element).toMatchObject({ archive: true, remplacePar: nouveau });
    expect(ficheAncien.remplacant).toEqual({ id: nouveau, nom: "Pompe à chaleur" });
    expect(ficheAncien.entretiens[0].actif).toBe(false);
    expect(ficheAncien.historique).toHaveLength(1);

    const ficheNouveau = await ok("ficheElement", nouveau);
    expect(ficheNouveau.element).toMatchObject({ maisonId: maison, categorie: "Chauffage et climatisation", emplacement: "Cellier", archive: false });
    expect(ficheNouveau.remplace).toEqual([{ id: ancien, nom: "Chaudière fioul" }]);
    expect(ficheNouveau.entretiens).toHaveLength(1);
    expect(ficheNouveau.entretiens[0]).toMatchObject({ titre: "Entretien annuel", echeance: "2027-10-15", actif: true });
    expect(ficheNouveau.historique).toEqual([]);
  });
});
