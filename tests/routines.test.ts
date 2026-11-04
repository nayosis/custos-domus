import { describe, expect, test } from "bun:test";
import { genererIcal } from "../serveur/ical";
import { calculerRappels } from "../serveur/rappels";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const refuse = async (nom: string, ...args: unknown[]) => (await s.rpc(nom, args, cookie)).status;
const jour = aujourdhui();

describe("choses à faire sur la maison", () => {
  test("rattachement : un élément ou une maison, jamais les deux ni aucun", async () => {
    const maison = await ok("creerMaison", { nom: "Maison" });
    const el = await ok("creerElement", { maisonId: maison, nom: "PAC" });
    expect(await refuse("creerEntretien", { titre: "Rien", echeance: jour })).toBe(400);
    expect(await refuse("creerEntretien", { elementId: el, maisonId: maison, titre: "Les deux", echeance: jour })).toBe(400);
    expect(await refuse("creerRealisation", { titre: "Rien", date: jour })).toBe(400);
  });

  test("routine : « Fait » en un geste (date du jour, ni coût ni prestataire), historique de la maison", async () => {
    const maison = await ok("creerMaison", { nom: "Maison des routines" });
    const presta = await ok("creerPrestataire", { nom: "Voisin" });
    const id = await ok("creerEntretien", {
      maisonId: maison,
      titre: "Sortir la poubelle jaune",
      nature: "routine",
      intervalleValeur: 2,
      intervalleUnite: "semaine",
      ancrage: "fixe",
      echeance: jour,
      prestataireId: presta,
    });
    const avant = await ok("aFaireMaison", maison);
    expect(avant.entretiens[0]).toMatchObject({ id, nature: "routine", delaiAlerteJours: 0, prestataireId: null, elementId: null, maisonId: maison });

    await ok("realiserEntretien", id, { cout: 12 });
    const apres = await ok("aFaireMaison", maison);
    expect(apres.entretiens[0].echeance).toBe(ajouter(jour, 2, "semaine"));
    expect(apres.historique).toHaveLength(1);
    expect(apres.historique[0]).toMatchObject({ date: jour, cout: null, prestataireId: null, maisonId: maison, elementId: null });

    // Une réparation sur la maison elle-même (toiture…).
    await ok("creerRealisation", { maisonId: maison, titre: "Gouttière recollée", date: jour, cout: 40 });
    expect((await ok("aFaireMaison", maison)).historique).toHaveLength(2);
  });

  test("page de la maison : ce qui est sur ses éléments, en lecture (pas les archivés ni les suspendus)", async () => {
    const maison = await ok("creerMaison", { nom: "Maison avec éléments" });
    const el = await ok("creerElement", { maisonId: maison, nom: "Chaudière" });
    const vieux = await ok("creerElement", { maisonId: maison, nom: "Ancien ballon" });
    await ok("creerEntretien", { elementId: el, titre: "Entretien chaudière", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: jour });
    const suspendu = await ok("creerEntretien", { elementId: el, titre: "Purge", echeance: jour });
    await ok("majEntretien", suspendu, { actif: false });
    await ok("creerEntretien", { elementId: vieux, titre: "Détartrage", echeance: jour });
    await ok("majElement", vieux, { archive: true });
    const p = await ok("aFaireMaison", maison);
    expect(p.surElements.map((e: { titre: string; elementNom: string }) => `${e.titre} / ${e.elementNom}`)).toEqual(["Entretien chaudière / Chaudière"]);
  });

  test("tableau de bord, rappels et agenda voient les choses à faire de la maison", async () => {
    const maison = await ok("creerMaison", { nom: "Maison suivie" });
    const id = await ok("creerEntretien", { maisonId: maison, titre: "Sortir la poubelle verte", nature: "routine", intervalleValeur: 1, intervalleUnite: "semaine", echeance: jour });
    await ok("creerRealisation", { maisonId: maison, titre: "Ramonage du conduit", date: jour, cout: 80 });

    const tdb = await ok("tableauDeBord", maison);
    expect(tdb.entretiens.map((e: { id: string; elementNom: string | null; maisonNom: string }) => [e.id, e.elementNom, e.maisonNom])).toEqual([[id, null, "Maison suivie"]]);
    expect(tdb.dernieres[0]).toMatchObject({ titre: "Ramonage du conduit", elementNom: null, maisonNom: "Maison suivie" });
    expect(tdb.depenses.entretien).toBe(80);

    const r = await calculerRappels(jour, ajouter(jour, -1, "jour"));
    const alerte = r.alertes.find((a) => a.type !== "garantie" && a.e.id === id);
    expect(alerte).toMatchObject({ type: "a_prevoir", e: { elementNom: null, maisonNom: "Maison suivie" } });

    const ics = await genererIcal();
    expect(ics).toContain("SUMMARY:À faire : Sortir la poubelle verte\r\n");
    expect(ics).toContain("DESCRIPTION:Maison suivie");

    // Maison archivée : plus rien.
    await ok("majMaison", maison, { archivee: true });
    expect((await ok("tableauDeBord")).entretiens.some((e: { id: string }) => e.id === id)).toBe(false);
  });

  test("supprimer la maison emporte ses choses à faire, son historique et leurs fichiers", async () => {
    const maison = await ok("creerMaison", { nom: "Maison à supprimer" });
    const id = await ok("creerEntretien", { maisonId: maison, titre: "Tondre", nature: "routine", intervalleValeur: 1, intervalleUnite: "semaine", echeance: jour });
    await ok("realiserEntretien", id);
    await ok("supprimerMaison", maison);
    expect(await refuse("aFaireMaison", maison)).toBe(404);
    expect((await ok("tableauDeBord")).entretiens.some((e: { id: string }) => e.id === id)).toBe(false);
  });

  test("modèles de routines installés par migration", async () => {
    const modeles = await ok("listeModeles");
    expect(modeles.filter((m: { categorie: string }) => m.categorie === "Routines").map((m: { titre: string }) => m.titre)).toContain("Sortir la poubelle jaune");
  });
});
