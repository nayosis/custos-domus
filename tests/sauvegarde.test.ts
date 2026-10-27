import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { ouvrirBase } from "../serveur/base";
import { installerSuperAdmin, ouvrirComptes } from "../serveur/comptes";
import { BASE_DONNEES, DOSSIER_DONNEES, DOSSIER_FICHIERS, DOSSIER_MIGRATIONS } from "../serveur/config";

// Base sur disque (la restauration remplace des fichiers), dans le dossier temporaire des tests.
mkdirSync(DOSSIER_FICHIERS, { recursive: true });
ouvrirBase(BASE_DONNEES, DOSSIER_MIGRATIONS);
ouvrirComptes(join(DOSSIER_DONNEES, "comptes.db"));
await installerSuperAdmin("super@custos.test", "super-mot-de-passe");
const { creerApp } = await import("../serveur/app");
const app = creerApp();
const maisons = await import("../src/data/maisons");

const connexion = async () => {
  const r = await app.handle(
    new Request("http://local/api/auth/connexion", {
      method: "POST",
      headers: { "content-type": "application/json", "x-custos": "1" },
      body: JSON.stringify({ email: "super@custos.test", motDePasse: "super-mot-de-passe", souvenir: false }),
    }),
  );
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
};
const cookie = await connexion();

const telecharger = async () => {
  const r = await app.handle(new Request("http://local/api/sauvegarde", { headers: { cookie } }));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-disposition")).toContain("custos-domus-sauvegarde-");
  return new Uint8Array(await r.arrayBuffer());
};
const restaurer = (zip: Uint8Array) => {
  const f = new FormData();
  f.append("fichier", new File([zip], "sauvegarde.zip", { type: "application/zip" }));
  return app.handle(new Request("http://local/api/sauvegarde/restaurer", { method: "POST", body: f, headers: { cookie, "x-custos": "1" } }));
};

describe("sauvegarde", () => {
  test("aller-retour : téléchargement, modifications, restauration de l'état sauvegardé", async () => {
    const maison = await maisons.creerMaison({ nom: "Maison" });
    writeFileSync(join(DOSSIER_FICHIERS, "11111111-aaaa.pdf"), "facture");
    const zip = await telecharger();
    const contenu = unzipSync(zip);
    // Le dossier de données est partagé par tous les fichiers de tests : d'autres fichiers peuvent s'y trouver.
    expect(Object.keys(contenu)).toEqual(expect.arrayContaining(["donnees.db", "fichiers/11111111-aaaa.pdf", "manifest.json"]));
    expect(JSON.parse(new TextDecoder().decode(contenu["manifest.json"]))).toMatchObject({ application: "Custos Domus", format: 1, compteurs: { maisons: 1 } });

    await maisons.creerMaison({ nom: "Après la sauvegarde" });
    writeFileSync(join(DOSSIER_FICHIERS, "22222222-bbbb.pdf"), "autre");
    const r = await restaurer(zip);
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps.installe.maisons).toBe(1);
    expect((await maisons.listeMaisons()).map((m) => m.id)).toEqual([maison]);
    expect(existsSync(join(DOSSIER_FICHIERS, "11111111-aaaa.pdf"))).toBe(true);
    // Base précédente conservée à côté ; les fichiers existants ne sont jamais supprimés.
    expect(existsSync(`${BASE_DONNEES}.avant-restauration`)).toBe(true);
    expect(existsSync(join(DOSSIER_FICHIERS, "22222222-bbbb.pdf"))).toBe(true);
  });

  test("ZIP piégé ou étranger refusé, base intacte", async () => {
    const avant = (await maisons.listeMaisons()).length;
    const etranger = zipSync({ "photo.jpg": strToU8("x") });
    expect((await (await restaurer(etranger)).json()).erreur).toContain("pas une sauvegarde");
    const piege = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: 1 })),
      "donnees.db": strToU8("ceci n'est pas une base"),
      "../../evasion.txt": strToU8("x"),
      "fichiers/../../evasion.pdf": strToU8("x"),
    });
    const r = await restaurer(piege);
    expect(r.status).toBe(400);
    expect(existsSync(join(DOSSIER_DONNEES, "..", "evasion.txt"))).toBe(false);
    expect((await maisons.listeMaisons()).length).toBe(avant);
  });

  test("droits : sans session, ni téléchargement ni restauration", async () => {
    expect((await app.handle(new Request("http://local/api/sauvegarde"))).status).toBe(401);
  });
});
