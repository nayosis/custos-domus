import { describe, expect, test } from "bun:test";
import { baseCourante } from "../serveur/base";
import { remplacerEnvois, type Notification } from "../serveur/envoi";
import { rappelerMissions } from "../serveur/famille";
import { reinitialiserLimitationEnfants } from "../serveur/routesEnfants";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { debutSemaine, faisable, finSemaine, partager, pinValide } from "../src/lib/famille";
import { SUPER, serveurDeTest } from "./outils-serveur";

// Notifications : capturées au lieu d'être envoyées.
const pushs: { endpoint: string; n: Notification }[] = [];
remplacerEnvois({
  push: async (a, n) => {
    pushs.push({ endpoint: a.endpoint, n });
    return "ok";
  },
});
const recus = (endpoint: string) => pushs.filter((p) => p.endpoint === endpoint).map((p) => p.n);

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

  test("qui s'en charge : un prestataire ou les enfants, l'un ou l'autre", async () => {
    const a = await ok("creerEnfant", { prenom: "Kenzo", pin: "3333" });
    const presta = await ok("creerPrestataire", { nom: "Paysagiste" });
    const maison = await ok("creerMaison", { nom: `Maison ${++n}` });
    const chose = async (id: string) => (await ok("aFaireMaison", maison)).entretiens.find((e: { id: string }) => e.id === id);
    const base = { maisonId: maison, titre: "Tondre", intervalleValeur: 2, intervalleUnite: "semaine", echeance: jour };

    expect(await refuse("creerEntretien", { ...base, prestataireId: presta, mission: { enfants: [a] } })).toBe(400);
    // Prestataire, puis confiée aux enfants : le prestataire s'efface.
    const id = await ok("creerEntretien", { ...base, prestataireId: presta });
    let e = await chose(id);
    await ok("majEntretien", id, { mission: { enfants: [a], points: 5 } }, e.modifieLe);
    expect(await chose(id)).toMatchObject({ points: 5, prestataireId: null });
    // Un prestataire choisi : ce n'est plus une mission.
    e = await chose(id);
    await ok("majEntretien", id, { prestataireId: presta }, e.modifieLe);
    expect(await chose(id)).toMatchObject({ points: null, enfantId: null, prestataireId: presta });
    expect(await missionDe(id)).toBeUndefined();
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

describe("notifications des enfants", () => {
  const abonner = (c: string, endpoint: string) =>
    s.requete("/api/enfant/notifications/abonnements", { corps: { endpoint, p256dh: "cle", auth: "auth", appareil: "Chrome sur Android" }, cookie: c });

  test("son téléphone : réponses des parents, missions du jour à 8 h ; rien pour les autres", async () => {
    const a = await ok("creerEnfant", { prenom: "Kenza", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Louis", pin: "2222" });
    const { cookie: ca } = await connexionEnfant("Kenza", "1111");
    const tel = "https://push.exemple/kenza";
    expect((await (await s.requete("/api/enfant/notifications", { cookie: ca })).json()).appareils).toEqual([]);
    expect((await abonner(ca, "http://pas-https")).status).toBe(400);
    const etat = await (await abonner(ca, tel)).json();
    expect(etat.appareils).toEqual([tel]);
    expect(etat.clePublique).toBeTruthy();

    // Missions du jour : la sienne, une en retard ; pas celle de Louis, pas celle de la semaine prochaine.
    await mission([a], { titre: "Ranger sa chambre", points: 10 });
    await mission([a, b], { titre: "Sortir le chien", echeance: ajouter(jour, -2, "jour") });
    await mission([b], { titre: "Arroser" });
    await mission([a], { titre: "Plus tard", echeance: ajouter(jour, 3, "jour") });
    pushs.length = 0;
    const bilan = await rappelerMissions(jour);
    expect(bilan.erreurs).toEqual([]);
    expect(recus(tel)).toEqual([{ titre: "2 missions aujourd'hui", corps: "Sortir le chien · Ranger sa chambre", url: "/enfant", tag: "custos-missions" }]);

    // Réponses des parents.
    pushs.length = 0;
    const m = await mission([a], { points: 15, titre: "Vider les poubelles" });
    await fait(ca, m);
    const r = (await ok("famille")).aValider.find((x: { enfantId: string }) => x.enfantId === a);
    await ok("validerMission", r.id);
    expect(recus(tel).map((n) => [n.titre, n.corps])).toEqual([["Mission validée", "Vider les poubelles : +15 pts"]]);
    const m2 = await mission([a], { points: 5, titre: "Mettre la table" });
    await fait(ca, m2);
    const r2 = (await ok("famille")).aValider.find((x: { enfantId: string }) => x.enfantId === a);
    await ok("refuserMission", r2.id, { motif: "Pas fini" });
    expect(recus(tel).at(-1)).toMatchObject({ titre: "Mission refusée", corps: "Mettre la table : Pas fini" });
    const cadeau = await ok("creerRecompense", { titre: "Un dessert", points: 10 });
    await s.requete(`/api/enfant/recompenses/${cadeau}/demander`, { corps: {}, cookie: ca });
    await ok("accorderEchange", (await espace(ca)).demandes[0].id);
    expect(recus(tel).at(-1)).toMatchObject({ titre: "Récompense accordée", corps: "Un dessert", url: "/enfant" });
    // Louis n'est pas abonné : rien n'est parti ailleurs.
    expect(pushs.every((p) => p.endpoint === tel)).toBe(true);
  });

  test("quitter, désactiver ou supprimer le profil : plus de notifications sur cet appareil", async () => {
    const a = await ok("creerEnfant", { prenom: "Maël", pin: "1111" });
    const tel = "https://push.exemple/mael";
    let { cookie: c } = await connexionEnfant("Maël", "1111");
    await abonner(c, tel);
    await s.requete("/api/enfant/deconnexion", { corps: { endpoint: tel }, cookie: c });
    ({ cookie: c } = await connexionEnfant("Maël", "1111"));
    expect((await (await s.requete("/api/enfant/notifications", { cookie: c })).json()).appareils).toEqual([]);

    await abonner(c, tel);
    // Retiré par l'enfant lui-même.
    expect((await (await s.requete("/api/enfant/notifications/abonnements/retirer", { corps: { endpoint: tel }, cookie: c })).json()).appareils).toEqual([]);
    await abonner(c, tel);
    await ok("majEnfant", a, { actif: false });
    await ok("majEnfant", a, { actif: true });
    ({ cookie: c } = await connexionEnfant("Maël", "1111"));
    expect((await (await s.requete("/api/enfant/notifications", { cookie: c })).json()).appareils).toEqual([]);

    await abonner(c, tel);
    await mission([a], { titre: "Promener le chien" });
    await ok("supprimerEnfant", a);
    pushs.length = 0;
    await rappelerMissions(jour);
    expect(recus(tel)).toEqual([]);
  });
});

describe("points partagés", () => {
  test("faite à plusieurs : à parts égales ou ressaisies ; chacun sa part, validée ou refusée pour tous", async () => {
    const a = await ok("creerEnfant", { prenom: "Nora", pin: "1111" });
    const b = await ok("creerEnfant", { prenom: "Oscar", pin: "2222" });
    const c = await ok("creerEnfant", { prenom: "Paul", pin: "3333" });
    const { cookie: ca } = await connexionEnfant("Nora", "1111");
    const { cookie: cb } = await connexionEnfant("Oscar", "2222");
    const faitAvec = (id: string, parts: { enfantId: string; points: number }[]) => s.requete(`/api/enfant/missions/${id}/fait`, { corps: { parts }, cookie: ca });
    expect(partager(15, 2)).toEqual([8, 7]);
    expect(partager(10, 3)).toEqual([4, 3, 3]);
    const autres = (await espace(ca)).autres.map((x: { prenom: string }) => x.prenom);
    expect(autres).toEqual(expect.arrayContaining(["Oscar", "Paul"]));
    expect(autres).not.toContain("Nora");

    // Nora la coche, faite avec Oscar (mission confiée à Nora seule) : 8 + 7.
    const m1 = await mission([a], { titre: "Laver la voiture", points: 15 });
    expect((await faitAvec(m1, [{ enfantId: a, points: 8 }, { enfantId: b, points: 6 }])).status).toBe(400); // 14 ≠ 15
    expect((await faitAvec(m1, [{ enfantId: a, points: 8 }, { enfantId: a, points: 7 }])).status).toBe(400);
    expect((await faitAvec(m1, [{ enfantId: a, points: 8 }, { enfantId: "inconnu", points: 7 }])).status).toBe(400);
    const r = await faitAvec(m1, [{ enfantId: a, points: 8 }, { enfantId: b, points: 7 }]);
    expect(r.status).toBe(200);
    expect((await r.json()).semaine.enAttente).toBe(8);
    expect((await espace(cb)).semaine.enAttente).toBe(7);
    expect((await espace(cb)).historique[0]).toMatchObject({ titre: "Laver la voiture", points: 7, avec: ["Nora"], validation: "a_valider" });

    const f = await ok("famille");
    const r1 = f.aValider.find((x: { titre: string }) => x.titre === "Laver la voiture");
    expect(r1.parts).toEqual([
      { enfantId: a, prenom: "Nora", points: 8 },
      { enfantId: b, prenom: "Oscar", points: 7 },
    ]);
    pushs.length = 0;
    await ok("validerMission", r1.id);
    expect((await espace(ca)).solde).toBe(8);
    expect((await espace(cb)).solde).toBe(7);

    // Ressaisi : tout à Paul (Nora garde 0), puis refusée : personne n'a rien.
    const m2 = await mission([a], { titre: "Ranger le garage", points: 20 });
    await faitAvec(m2, [{ enfantId: c, points: 20 }]);
    const r2 = (await ok("famille")).aValider.find((x: { titre: string }) => x.titre === "Ranger le garage");
    expect(r2.parts.map((p: { prenom: string; points: number }) => [p.prenom, p.points])).toEqual([
      ["Nora", 0],
      ["Paul", 20],
    ]);
    await ok("refuserMission", r2.id);
    const paul = (await ok("famille")).enfants.find((x: { id: string }) => x.id === c);
    expect(paul.solde).toBe(0);

    // Oscar supprimé : Nora garde sa part.
    await ok("supprimerEnfant", b);
    expect((await espace(ca)).solde).toBe(8);
    const recente = (await ok("famille")).recentes.find((x: { id: string }) => x.id === r1.id);
    expect(recente).toMatchObject({ enfantId: a, points: 8 });
  });
});
