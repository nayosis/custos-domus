import { describe, expect, test } from "bun:test";
import { baseCourante } from "../serveur/base";
import { reinitialiserLimitationEnfants } from "../serveur/routesEnfants";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { debutSemaine, faisable, finSemaine, pinValide } from "../src/lib/famille";
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

/** Connexion d'un enfant : renvoie son cookie (ou la réponse en cas d'échec). */
const connexionEnfant = async (prenom: string, pin: string, souvenir = false) => {
  const r = await s.requete("/api/enfant/connexion", { corps: { prenom, pin, souvenir } });
  return { r, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
};
const espace = async (c: string) => (await s.requete("/api/enfant/espace", { cookie: c })).json();
const fait = (c: string, id: string) => s.requete(`/api/enfant/missions/${id}/fait`, { corps: {}, cookie: c });

let n = 0;
/** Une maison, une routine hebdomadaire confiée aux enfants donnés. */
async function mission(enfants: string[], options: { points?: number; echeance?: string; titre?: string } = {}) {
  const maison = await ok("creerMaison", { nom: `Maison ${++n}` });
  return ok("creerEntretien", {
    maisonId: maison,
    titre: options.titre ?? `Mission ${n}`,
    nature: "routine",
    intervalleValeur: 1,
    intervalleUnite: "semaine",
    echeance: options.echeance ?? jour,
    mission: { enfants, points: options.points },
  });
}
const missionDe = async (id: string) => (await ok("famille")).missions.find((m: { id: string }) => m.id === id);

describe("règles", () => {
  test("semaines du lundi au dimanche ; codes ; avance", () => {
    expect(debutSemaine("2026-11-04")).toBe("2026-11-02"); // mercredi
    expect(debutSemaine("2026-11-08")).toBe("2026-11-02"); // dimanche
    expect(debutSemaine("2026-11-09")).toBe("2026-11-09"); // lundi
    expect(finSemaine("2026-11-04")).toBe("2026-11-08");
    expect(pinValide("1234")).toBe(true);
    expect(pinValide("123")).toBe(false);
    expect(pinValide("12a4")).toBe(false);
    expect(faisable("2026-11-06", "2026-11-04", false)).toBe(true);
    expect(faisable("2026-11-07", "2026-11-04", false)).toBe(false);
    expect(faisable("2026-11-01", "2026-11-04", true)).toBe(false);
  });
});

describe("profils et connexion", () => {
  test("prénom unique, code de 4 à 8 chiffres ; le code n'apparaît pas dans le journal", async () => {
    await ok("creerEnfant", { prenom: "Léo", pin: "4821" });
    expect(await refuse("creerEnfant", { prenom: "léo", pin: "1111" })).toBe(400);
    expect(await refuse("creerEnfant", { prenom: "Zoé", pin: "12" })).toBe(400);
    const journal = await (await s.requete("/api/journal", { cookie })).json();
    const ligne = journal.lignes.find((l: { fonction: string }) => l.fonction === "creerEnfant");
    expect(ligne.resume).not.toContain("4821");
  });

  test("connexion par prénom (sans majuscule) et code ; l'enfant n'a pas accès au reste", async () => {
    const id = await ok("creerEnfant", { prenom: "Inès", pin: "2468" });
    expect((await connexionEnfant("Inès", "0000")).r.status).toBe(401);
    expect((await connexionEnfant("Personne", "2468")).r.status).toBe(401);
    const { r, cookie: c } = await connexionEnfant("inès", "2468");
    expect(r.status).toBe(200);
    expect(await (await s.requete("/api/enfant/moi", { cookie: c })).json()).toEqual({ prenom: "Inès" });
    // Le cookie de l'enfant n'ouvre ni les fonctions RPC ni la page Famille.
    expect((await s.rpc("famille", [], c)).status).toBe(401);
    expect((await s.rpc("listeMaisons", [], c)).status).toBe(401);
    // Désactivé : déconnecté, et ne peut plus se connecter.
    await ok("majEnfant", id, { actif: false });
    expect((await s.requete("/api/enfant/moi", { cookie: c })).status).toBe(401);
    expect((await connexionEnfant("Inès", "2468")).r.status).toBe(401);
  });

  test("10 codes faux de suite : bloqué jusqu'à un nouveau code donné par un parent", async () => {
    const id = await ok("creerEnfant", { prenom: "Sam", pin: "1357" });
    for (let i = 0; i < 10; i++) {
      reinitialiserLimitationEnfants();
      expect((await connexionEnfant("Sam", "9999")).r.status).toBe(401);
    }
    expect((await connexionEnfant("Sam", "1357")).r.status).toBe(423);
    expect((await ok("famille")).enfants.find((e: { id: string }) => e.id === id).bloque).toBe(true);
    await ok("changerPin", id, { pin: "8642" });
    expect((await connexionEnfant("Sam", "8642")).r.status).toBe(200);
    reinitialiserLimitationEnfants();
  });
});

describe("missions", () => {
  test("l'enfant ne voit que ses missions ; fait : à valider, échéance suivante ; une fois par jour", async () => {
    const a = await ok("creerEnfant", { prenom: "Alice", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Bruno", pin: "2222" });
    const sienne = await mission([a], { titre: "Sortir la poubelle jaune", points: 15 });
    await mission([b], { titre: "Mettre la table" });
    const pasEncore = await mission([a], { titre: "Arroser", echeance: ajouter(jour, 5, "jour") });
    const { cookie: ca } = await connexionEnfant("Alice", "1111");

    const avant = await espace(ca);
    expect(avant.missions.map((m: { titre: string }) => m.titre)).toEqual(["Sortir la poubelle jaune", "Arroser"]);
    expect(avant.missions[0]).toMatchObject({ points: 15, faisable: true, ou: expect.stringContaining("Maison") });
    expect(avant.missions[1].faisable).toBe(false);
    expect((await fait(ca, pasEncore)).status).toBe(400);

    const r = await fait(ca, sienne);
    expect(r.status).toBe(200);
    const apres = await r.json();
    expect(apres.semaine).toMatchObject({ validees: 0, enAttente: 15 });
    expect(apres.historique[0]).toMatchObject({ titre: "Sortir la poubelle jaune", validation: "a_valider", points: 15 });
    expect((await missionDe(sienne)).echeance).toBe(ajouter(jour, 1, "semaine"));
    // La suivante est dans une semaine : rien à cocher aujourd'hui.
    expect((await fait(ca, sienne)).status).toBe(400);
    // Pas la sienne.
    const deBruno = (await ok("famille")).missions.find((m: { titre: string }) => m.titre === "Mettre la table").id;
    expect((await fait(ca, deBruno)).status).toBe(404);
  });

  test("partagée : chacun la voit, le premier qui la fait gagne les points, elle est faite pour tous", async () => {
    const a = await ok("creerEnfant", { prenom: "Côme", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Dina", pin: "2222" });
    const id = await mission([a, b], { titre: "Vider le lave-vaisselle", points: 12, echeance: ajouter(jour, -1, "jour") });
    expect(await ok("enfantsMission", id)).toEqual([a, b]);
    expect(await missionDe(id)).toMatchObject({ enfantId: null, enfants: [a, b] });
    const { cookie: ca } = await connexionEnfant("Côme", "1111");
    const { cookie: cb } = await connexionEnfant("Dina", "2222");
    const vue = (await espace(cb)).missions.find((m: { id: string }) => m.id === id);
    expect(vue).toMatchObject({ faisable: true, avec: ["Côme"] });

    // Dina la fait : ses points ; pour Côme, elle est faite (échéance suivante, plus rien à cocher aujourd'hui).
    const apres = await (await fait(cb, id)).json();
    expect(apres.semaine.enAttente).toBe(12);
    expect((await espace(ca)).semaine.enAttente).toBe(0);
    expect((await espace(ca)).missions.find((m: { id: string }) => m.id === id).faisable).toBe(false);
    expect((await fait(ca, id)).status).toBe(400);
    // Toujours partagée.
    expect(await missionDe(id)).toMatchObject({ enfantId: null, enfants: [a, b] });

    // Plus une mission.
    await ok("majEntretien", id, { mission: null });
    expect(await missionDe(id)).toBeUndefined();
    expect(await ok("enfantsMission", id)).toEqual([]);
  });

  test("validation par un parent, ou d'office après 48 h ; refus : aucun point, la mission revient comme avant", async () => {
    const a = await ok("creerEnfant", { prenom: "Fanny", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Gaspard", pin: "2222" });
    const m1 = await mission([a], { points: 10 });
    const m2 = await mission([a], { points: 20 });
    const m3 = await mission([a, b], { points: 5 });
    const { cookie: ca } = await connexionEnfant("Fanny", "1111");
    for (const m of [m1, m2, m3]) expect((await fait(ca, m)).status).toBe(200);

    const f = await ok("famille");
    const aValider = f.aValider.filter((r: { enfantId: string }) => r.enfantId === a);
    expect(aValider).toHaveLength(3);
    const [r1, r2, r3] = aValider;

    await ok("validerMission", r1.id);
    expect(await refuse("validerMission", r1.id)).toBe(400);
    // Une validation oubliée : validée d'office au bout de 48 h.
    baseCourante().query("UPDATE realisation SET cree_le = datetime('now', '-49 hours') WHERE id = ?").run(r2.id);
    // Refusée : la mission partagée revient, à la même échéance, et redevient faisable pour les deux.
    expect((await missionDe(m3)).echeance).toBe(ajouter(jour, 1, "semaine"));
    await ok("refuserMission", r3.id, { motif: "Pas fait" });
    expect(await missionDe(m3)).toMatchObject({ enfantId: null, echeance: jour });

    const e = await espace(ca);
    expect(e.semaine).toMatchObject({ validees: 30, enAttente: 0 });
    expect(e.solde).toBe(30);
    expect(e.historique.find((h: { id: string }) => h.id === r3.id).validation).toBe("refusee");
    const fanny = (await ok("famille")).enfants.find((x: { id: string }) => x.id === a);
    expect(fanny).toMatchObject({ solde: 30, semaine: { validees: 30 } });
  });

  test("hors de la maison archivée ; supprimer un enfant laisse la mission aux autres", async () => {
    const a = await ok("creerEnfant", { prenom: "Hugo", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Iris", pin: "2222" });
    const id = await mission([a, b]);
    const seul = await mission([a]);
    await ok("supprimerEnfant", a);
    expect(await missionDe(id)).toMatchObject({ enfantId: b, enfants: [b] });
    expect(await missionDe(seul)).toBeUndefined();
  });
});

describe("récompenses", () => {
  test("demande réservée sur le solde ; accordée : dépensée ; refusée : les points reviennent", async () => {
    const a = await ok("creerEnfant", { prenom: "Jade", pin: "1111" });
    const cinema = await ok("creerRecompense", { titre: "Une séance de cinéma", points: 25 });
    const ecran = await ok("creerRecompense", { titre: "Une heure d'écran", points: 10 });
    const m = await mission([a], { points: 30 });
    const { cookie: ca } = await connexionEnfant("Jade", "1111");
    await fait(ca, m);
    // Pas encore validée : pas de points à dépenser.
    expect((await s.requete(`/api/enfant/recompenses/${ecran}/demander`, { corps: {}, cookie: ca })).status).toBe(400);
    const f = await ok("famille");
    await ok("validerMission", f.aValider.find((r: { enfantId: string }) => r.enfantId === a).id);

    let e = await (await s.requete(`/api/enfant/recompenses/${cinema}/demander`, { corps: {}, cookie: ca })).json();
    expect(e.solde).toBe(5);
    expect(e.demandes[0]).toMatchObject({ titre: "Une séance de cinéma", statut: "demandee" });
    expect((await s.requete(`/api/enfant/recompenses/${ecran}/demander`, { corps: {}, cookie: ca })).status).toBe(400);
    const demande = e.demandes[0].id;
    await ok("refuserEchange", demande);
    e = await espace(ca);
    expect(e.solde).toBe(30);
    await (await s.requete(`/api/enfant/recompenses/${cinema}/demander`, { corps: {}, cookie: ca })).json();
    await ok("accorderEchange", (await espace(ca)).demandes[0].id);
    e = await espace(ca);
    expect(e.solde).toBe(5);
    expect(e.demandes[0].statut).toBe("accordee");
    // Désactivée : plus proposée.
    await ok("majRecompense", ecran, { actif: false });
    expect((await espace(ca)).recompenses.map((r: { titre: string }) => r.titre)).toEqual(["Une séance de cinéma"]);
  });
});
