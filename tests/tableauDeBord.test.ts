import { describe, expect, test } from "bun:test";
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

const jour = aujourdhui();
const annee = Number(jour.slice(0, 4));

describe("tableau de bord", () => {
  test("entretiens, garanties, dernières interventions et dépenses ; filtre maison ; archives exclues", async () => {
    const maison = await ok("creerMaison", { nom: "Maison" });
    const location = await ok("creerMaison", { nom: "Location" });
    const vendue = await ok("creerMaison", { nom: "Vendue" });
    await ok("majMaison", vendue, { archivee: true });

    const pac = await ok("creerElement", { maisonId: maison, nom: "PAC", finGarantie: ajouter(jour, 20, "jour"), prix: 9800, dateAchat: `${annee}-03-01` });
    const fosse = await ok("creerElement", { maisonId: location, nom: "Fosse septique" });
    const vieux = await ok("creerElement", { maisonId: maison, nom: "Vieux four", finGarantie: ajouter(jour, 10, "jour") });
    await ok("majElement", vieux, { archive: true });
    const ailleurs = await ok("creerElement", { maisonId: vendue, nom: "Chaudière" });

    const enRetard = await ok("creerEntretien", { elementId: fosse, titre: "Vidange", nature: "rdv", intervalleValeur: 4, intervalleUnite: "an", echeance: ajouter(jour, -10, "jour") });
    await ok("creerEntretien", { elementId: pac, titre: "Entretien PAC", nature: "rdv", intervalleValeur: 2, intervalleUnite: "an", echeance: ajouter(jour, 2, "an") });
    await ok("creerEntretien", { elementId: vieux, titre: "Nettoyage four", echeance: jour });
    await ok("creerEntretien", { elementId: ailleurs, titre: "Entretien chaudière", echeance: jour });

    await ok("creerRealisation", { elementId: pac, date: `${annee}-02-01`, titre: "Dépannage", cout: 120 });
    await ok("creerRealisation", { elementId: vieux, date: `${annee}-01-15`, titre: "Résistance", cout: 60.5 });
    await ok("creerRealisation", { elementId: fosse, date: `${annee - 1}-06-01`, titre: "Débouchage", cout: 300 });
    await ok("creerRealisation", { elementId: ailleurs, date: `${annee}-01-10`, titre: "Hors suivi", cout: 999 });

    const tout = await ok("tableauDeBord");
    expect(tout.aujourdhui).toBe(jour);
    expect(tout.entretiens.map((e: { titre: string }) => e.titre)).toEqual(["Vidange", "Entretien PAC"]);
    expect(tout.entretiens[0]).toMatchObject({ id: enRetard, elementNom: "Fosse septique", maisonNom: "Location" });
    expect(tout.garanties.map((g: { nom: string }) => g.nom)).toEqual(["PAC"]);
    // L'historique d'un élément archivé compte encore ; celui d'une maison archivée, non.
    expect(tout.dernieres.map((r: { titre: string }) => r.titre)).toEqual(["Dépannage", "Résistance", "Débouchage"]);
    expect(tout.depenses).toEqual({ annee, entretien: 180.5, nombre: 2, anneePrecedente: 300, achats: 9800 });

    const location_ = await ok("tableauDeBord", location);
    expect(location_.entretiens.map((e: { titre: string }) => e.titre)).toEqual(["Vidange"]);
    expect(location_.garanties).toEqual([]);
    expect(location_.depenses).toMatchObject({ entretien: 0, anneePrecedente: 300, achats: 0 });
  });
});
