import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { DOSSIER_FICHIERS, DOSSIER_SAUVEGARDES } from "../serveur/config";
import { etatSauvegardeAuto, listeSauvegardes, nettoyerOrphelins, rotation, sauvegardeDeNuit, sauvegarder } from "../serveur/sauvegardeAuto";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);
mkdirSync(DOSSIER_FICHIERS, { recursive: true });

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const vider = () => {
  rmSync(DOSSIER_SAUVEGARDES, { recursive: true, force: true });
  mkdirSync(DOSSIER_SAUVEGARDES, { recursive: true });
};
const ilYA = (jours: number) => new Date(Date.now() - jours * 86_400_000);

describe("sauvegarde automatique", () => {
  test("ZIP complet et restaurable dans data/sauvegardes ; deux dans la même minute ne s'écrasent pas", async () => {
    vider();
    await ok("creerMaison", { nom: "Maison" });
    const quand = new Date(2026, 9, 28, 3, 0);
    const a = await sauvegarder("nuit", quand);
    const b = await sauvegarder("nuit", quand);
    expect(a.nom).toBe("custos-domus-sauvegarde-2026-10-28_03h00.zip");
    expect(b.nom).toBe("custos-domus-sauvegarde-2026-10-28_03h00-2.zip");
    const contenu = unzipSync(new Uint8Array(await Bun.file(join(DOSSIER_SAUVEGARDES, a.nom)).arrayBuffer()));
    expect(JSON.parse(new TextDecoder().decode(contenu["manifest.json"]))).toMatchObject({ application: "Custos Domus", motif: "nuit", compteurs: { maisons: 1 } });
    expect(readdirSync(DOSSIER_SAUVEGARDES).some((f) => f.endsWith(".partiel"))).toBe(false);
  });

  test("rotation : seules les plus récentes sont gardées", () => {
    vider();
    for (let i = 1; i <= 5; i++) {
      const nom = `custos-domus-sauvegarde-2026-10-0${i}_03h00.zip`;
      writeFileSync(join(DOSSIER_SAUVEGARDES, nom), "zip");
      utimesSync(join(DOSSIER_SAUVEGARDES, nom), ilYA(10 - i), ilYA(10 - i));
    }
    writeFileSync(join(DOSSIER_SAUVEGARDES, "a-moi.txt"), "ne pas toucher");
    expect(rotation(3).sort()).toEqual(["custos-domus-sauvegarde-2026-10-01_03h00.zip", "custos-domus-sauvegarde-2026-10-02_03h00.zip"]);
    expect(listeSauvegardes().map((x) => x.nom)).toEqual([
      "custos-domus-sauvegarde-2026-10-05_03h00.zip",
      "custos-domus-sauvegarde-2026-10-04_03h00.zip",
      "custos-domus-sauvegarde-2026-10-03_03h00.zip",
    ]);
    expect(existsSync(join(DOSSIER_SAUVEGARDES, "a-moi.txt"))).toBe(true);
  });

  test("fichiers orphelins effacés au bout de 7 jours ; jamais ceux d'un document", async () => {
    const maison = await ok("creerMaison", { nom: "Maison" });
    const el = await ok("creerElement", { maisonId: maison, nom: "PAC" });
    const f = new FormData();
    f.append("fichier", new File([new Uint8Array([37, 80, 68, 70])], "facture.pdf", { type: "application/pdf" }));
    const envoi = await (await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-custos": "1", cookie } }))).json();
    await ok("creerDocument", { elementId: el, fichier: envoi.fichier, nom: envoi.nom });

    const vieux = "aaaaaaaa-0000-orphelin.pdf";
    const recent = "bbbbbbbb-0000-orphelin.pdf";
    writeFileSync(join(DOSSIER_FICHIERS, vieux), "x");
    writeFileSync(join(DOSSIER_FICHIERS, recent), "x");
    for (const nom of [vieux, envoi.fichier]) utimesSync(join(DOSSIER_FICHIERS, nom), ilYA(30), ilYA(30));

    expect(await nettoyerOrphelins()).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(DOSSIER_FICHIERS, vieux))).toBe(false);
    expect(existsSync(join(DOSSIER_FICHIERS, recent))).toBe(true);
    expect(existsSync(join(DOSSIER_FICHIERS, envoi.fichier))).toBe(true);
  });

  test("la sauvegarde de la nuit note son résultat", async () => {
    vider();
    const e = await sauvegardeDeNuit(new Date());
    expect(e.erreur).toBeUndefined();
    expect(etatSauvegardeAuto()).toMatchObject({ nom: e.nom, jour: e.jour });
    expect(listeSauvegardes()).toHaveLength(1);
  });
});

describe("routes", () => {
  test("liste, sauvegarde immédiate, téléchargement, restauration : admins (et super admin pour restaurer)", async () => {
    vider();
    const ecrivain = await s.compte("ecrivain@famille.fr", "ecriture");
    expect((await s.requete("/api/sauvegarde/automatiques", { cookie: ecrivain.cookie })).status).toBe(403);

    const faite = await (await s.requete("/api/sauvegarde/automatiques", { methode: "POST", corps: {}, cookie })).json();
    const liste = await (await s.requete("/api/sauvegarde/automatiques", { cookie })).json();
    expect(liste.sauvegardes.map((x: { nom: string }) => x.nom)).toEqual([faite.nom]);
    expect(liste.conservees).toBe(14);

    const telechargement = await s.requete(`/api/sauvegarde/automatiques/${faite.nom}`, { cookie });
    expect(telechargement.status).toBe(200);
    expect(telechargement.headers.get("content-disposition")).toContain(faite.nom);
    expect((await s.requete("/api/sauvegarde/automatiques/..%2F..%2Fcomptes.db", { cookie })).status).toBe(404);

    const avant = (await ok("listeMaisons")).length;
    await ok("creerMaison", { nom: "Après la sauvegarde" });
    const admin = await s.compte("admin@famille.fr", "admin");
    expect((await s.requete(`/api/sauvegarde/automatiques/${faite.nom}/restaurer`, { methode: "POST", corps: {}, cookie: admin.cookie })).status).toBe(403);
    const r = await s.requete(`/api/sauvegarde/automatiques/${faite.nom}/restaurer`, { methode: "POST", corps: {}, cookie });
    expect(r.status).toBe(200);
    expect((await ok("listeMaisons")).length).toBe(avant);
  });
});
