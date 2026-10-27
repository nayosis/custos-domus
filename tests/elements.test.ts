import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cheminFichier } from "../serveur/fichiers";
import { SUPER, serveurDeTest } from "./outils-serveur";
import { etatGarantie, plusAnnees } from "../src/lib/elements";
import { typeDevine } from "../src/lib/documents";
import { lireDate } from "../src/lib/dates";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

/** Appel RPC qui doit réussir ; renvoie le résultat. */
const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const envoyer = async (nom: string, type: string) => {
  const f = new FormData();
  f.append("fichier", new File([new Uint8Array([37, 80, 68, 70, 45])], nom, { type }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-custos": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

describe("éléments", () => {
  test("création, fiche, modification ; textes rognés, vides → null", async () => {
    const maison = await ok("creerMaison", { nom: "Maison" });
    const id = await ok("creerElement", { maisonId: maison, nom: "  Pompe à chaleur ", marque: "Daikin", modele: "", prix: 9800 });
    const fiche = await ok("ficheElement", id);
    expect(fiche.element).toMatchObject({ nom: "Pompe à chaleur", marque: "Daikin", modele: null, prix: 9800, archive: false });
    expect(fiche.maison).toMatchObject({ id: maison, nom: "Maison" });
    expect(fiche.documents).toEqual([]);

    await ok("majElement", id, { finGarantie: "2031-05-01", emplacement: "Garage" }, fiche.element.modifieLe);
    const liste = await ok("listeElements");
    expect(liste.find((e: { id: string }) => e.id === id)).toMatchObject({ maisonNom: "Maison", finGarantie: "2031-05-01", emplacement: "Garage", nbDocuments: 0 });
    expect((await ok("listeMaisons")).find((m: { id: string }) => m.id === maison).nbElements).toBe(1);

    expect((await s.rpc("creerElement", [{ maisonId: maison, nom: "   " }], cookie)).status).toBe(400);
    expect((await s.rpc("ficheElement", ["inconnu"], cookie)).status).toBe(404);
  });

  test("documents : envoi, rattachement, type deviné, modification, suppression du fichier", async () => {
    const maison = await ok("creerMaison", { nom: "Location" });
    const id = await ok("creerElement", { maisonId: maison, nom: "Lave-linge" });
    const envoi = await envoyer("Facture Darty.pdf", "application/pdf");
    const doc = await ok("creerDocument", { elementId: id, fichier: envoi.fichier, nom: envoi.nom });
    let fiche = await ok("ficheElement", id);
    expect(fiche.documents).toHaveLength(1);
    expect(fiche.documents[0]).toMatchObject({ id: doc, type: "facture", nom: "Facture Darty.pdf", mime: "application/pdf", taille: 5 });

    // Le même fichier ne se rattache pas deux fois ; un fichier inexistant ou un nom piégé est refusé.
    expect((await s.rpc("creerDocument", [{ elementId: id, fichier: envoi.fichier, nom: "x" }], cookie)).status).toBe(400);
    expect((await s.rpc("creerDocument", [{ elementId: id, fichier: "../../comptes.db", nom: "x" }], cookie)).status).toBe(400);
    expect((await s.rpc("creerDocument", [{ fichier: envoi.fichier, nom: "x" }], cookie)).status).toBe(400);

    await ok("majDocument", doc, { nom: "Facture d'achat", type: "garantie", date: "2026-03-14" });
    fiche = await ok("ficheElement", id);
    expect(fiche.documents[0]).toMatchObject({ nom: "Facture d'achat", type: "garantie", date: "2026-03-14" });
    expect((await s.rpc("majDocument", [doc, { type: "n'importe quoi" }], cookie)).status).toBe(400);

    await ok("supprimerDocument", doc);
    expect(existsSync(cheminFichier(envoi.fichier))).toBe(false);
    expect((await ok("ficheElement", id)).documents).toEqual([]);
  });

  test("supprimer un élément ou une maison supprime aussi les fichiers", async () => {
    const maison = await ok("creerMaison", { nom: "À vendre" });
    const a = await ok("creerElement", { maisonId: maison, nom: "PC" });
    const b = await ok("creerElement", { maisonId: maison, nom: "Four" });
    const fa = await envoyer("notice.pdf", "application/pdf");
    const fb = await envoyer("photo.jpg", "image/jpeg");
    await ok("creerDocument", { elementId: a, fichier: fa.fichier, nom: fa.nom });
    const docB = await ok("creerDocument", { elementId: b, fichier: fb.fichier, nom: fb.nom });
    expect((await ok("ficheElement", b)).documents[0]).toMatchObject({ id: docB, type: "photo", mime: "image/jpeg" });

    await ok("supprimerElement", a);
    expect(existsSync(cheminFichier(fa.fichier))).toBe(false);
    expect(existsSync(cheminFichier(fb.fichier))).toBe(true);
    await ok("supprimerMaison", maison);
    expect(existsSync(cheminFichier(fb.fichier))).toBe(false);
    expect((await s.rpc("ficheElement", [b], cookie)).status).toBe(404);
  });
});

describe("prestataires", () => {
  test("création, modification, suppression", async () => {
    const id = await ok("creerPrestataire", { nom: " Chauffage Martin ", metier: "Chauffagiste", telephone: "06 12 34 56 78", email: "" });
    expect((await ok("listePrestataires")).find((p: { id: string }) => p.id === id)).toMatchObject({ nom: "Chauffage Martin", email: null });
    await ok("majPrestataire", id, { notes: "Contrat d'entretien annuel" });
    expect((await ok("listePrestataires")).find((p: { id: string }) => p.id === id).notes).toBe("Contrat d'entretien annuel");
    expect((await s.rpc("majPrestataire", [id, { nom: "" }], cookie)).status).toBe(400);
    await ok("supprimerPrestataire", id);
    expect((await ok("listePrestataires")).some((p: { id: string }) => p.id === id)).toBe(false);
  });
});

describe("règles", () => {
  test("garantie : valide, bientôt expirée (un mois), expirée", () => {
    const jour = new Date(2026, 9, 27);
    expect(etatGarantie(null, jour)).toEqual({ etat: "aucune" });
    expect(etatGarantie("2028-10-27", jour).etat).toBe("valide");
    expect(etatGarantie("2026-11-20", jour)).toMatchObject({ etat: "bientot", jours: 24 });
    expect(etatGarantie("2026-10-26", jour).etat).toBe("expiree");
  });

  test("durée de garantie ajoutée à une date ; 29 février", () => {
    expect(plusAnnees("2026-03-14", 2)).toBe("2028-03-14");
    expect(plusAnnees("2028-02-29", 1)).toBe("2029-02-28");
  });

  test("type de document deviné d'après le nom", () => {
    expect(typeDevine("Garantie PAC.pdf", "application/pdf")).toBe("garantie");
    expect(typeDevine("IMG_2034.jpg", "image/jpeg")).toBe("photo");
    expect(typeDevine("scan.pdf", "application/pdf")).toBe("autre");
  });
});

test("date saisie au clavier", () => {
  expect(lireDate("14/03/2025")).toBe("2025-03-14");
  expect(lireDate("4-3-25")).toBe("2025-03-04");
  expect(lireDate("2025-03-14")).toBe("2025-03-14");
  expect(lireDate("31/02/2025")).toBeNull();
  expect(lireDate("demain")).toBeNull();
});
