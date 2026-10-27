import { describe, expect, test } from "bun:test";
import { FONCTIONS } from "../serveur/rpc";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

describe("RPC", () => {
  test("lectures et écritures repérées, toutes les fonctions de src/data/ exposées", () => {
    expect(FONCTIONS.get("listeMaisons")?.droit).toBe("lecture");
    expect(FONCTIONS.get("creerMaison")?.droit).toBe("ecriture");
    expect(FONCTIONS.get("supprimerMaison")?.droit).toBe("ecriture");
  });

  test("écriture puis lecture ; écritures journalisées", async () => {
    const r = await s.rpc("creerMaison", [{ nom: "  Location  ", adresse: "12 rue des Lilas" }], cookie);
    expect(r.status).toBe(200);
    const { resultat: id } = await r.json();
    expect(typeof id).toBe("string");
    const liste = await (await s.rpc("listeMaisons", [], cookie)).json();
    expect(liste.resultat.find((m: { id: string }) => m.id === id)).toMatchObject({ nom: "Location", adresse: "12 rue des Lilas", creePar: SUPER.email });
    const journal = await (await s.requete("/api/journal", { cookie })).json();
    expect(journal.lignes[0]).toMatchObject({ fonction: "creerMaison", cible: id, utilisateur: SUPER.email });
  });

  test("conflit : version périmée modifiée par quelqu'un d'autre refusée", async () => {
    const autre = await s.compte("autre@famille.fr", "ecriture");
    const id = (await (await s.rpc("creerMaison", [{ nom: "Maison" }], cookie)).json()).resultat;
    const { resultat: v1 } = await (await s.rpc("majMaison", [id, { notes: "a" }], cookie)).json();
    // La version est l'heure à la milliseconde : deux écritures dans la même milliseconde se confondraient.
    await Bun.sleep(5);
    expect((await s.rpc("majMaison", [id, { notes: "b" }, v1.modifieLe], autre.cookie)).status).toBe(200);
    expect((await s.rpc("majMaison", [id, { notes: "c" }, v1.modifieLe], cookie)).status).toBe(409);
  });

  test("fonction inconnue : 404 ; arguments invalides : 422", async () => {
    expect((await s.rpc("dropTable", [], cookie)).status).toBe(404);
    expect((await s.requete("/api/rpc/listeMaisons", { corps: {}, cookie })).status).toBe(422);
  });
});
