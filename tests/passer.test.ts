import { describe, expect, test } from "bun:test";
import { instantLocal } from "../serveur/ical";
import { aujourdhui } from "../src/lib/dates";
import { ajouter, echeanceApresPassage, libelleHeure, libelleIntervalle, lireHeure, prochaineEcheance } from "../src/lib/entretiens";
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
const nouvelElement = async (nom = "Poubelles") => {
  const maison = await ok("creerMaison", { nom: "Maison" });
  return ok("creerElement", { maisonId: maison, nom });
};
const fiche = (elementId: string) => ok("ficheElement", elementId);
const entretienDe = async (elementId: string, id: string) => (await fiche(elementId)).entretiens.find((e: { id: string }) => e.id === id);
const jour = aujourdhui();

describe("règles", () => {
  test("semaines : ajout, libellés", () => {
    expect(ajouter("2026-11-03", 2, "semaine")).toBe("2026-11-17");
    expect(ajouter("2026-12-29", 1, "semaine")).toBe("2027-01-05");
    expect(libelleIntervalle({ intervalleValeur: 1, intervalleUnite: "semaine" })).toBe("chaque semaine");
    expect(libelleIntervalle({ intervalleValeur: 2, intervalleUnite: "semaine" })).toBe("toutes les 2 semaines");
    expect(libelleIntervalle({ intervalleValeur: 3, intervalleUnite: "mois" })).toBe("tous les 3 mois");
  });

  test("passer : depuis l'échéance d'origine, sans laisser d'échéances déjà dépassées", () => {
    const poubelle = { intervalleValeur: 2, intervalleUnite: "semaine", ancrage: "realisation", echeance: "2026-11-03" };
    expect(echeanceApresPassage(poubelle, "2026-11-03")).toBe("2026-11-17");
    expect(echeanceApresPassage(poubelle, "2026-11-01")).toBe("2026-11-17");
    // Trois semaines de retard : la suivante n'est pas dans le passé (elle peut tomber aujourd'hui).
    expect(echeanceApresPassage(poubelle, "2026-11-24")).toBe("2026-12-01");
    expect(echeanceApresPassage(poubelle, "2026-12-01")).toBe("2026-12-01");
    // Échéance reportée : on repart de sa date d'origine.
    expect(echeanceApresPassage({ ...poubelle, echeance: "2026-11-05", echeanceInitiale: "2026-11-03" }, "2026-11-05")).toBe("2026-11-17");
    expect(echeanceApresPassage({ intervalleValeur: null, intervalleUnite: null, ancrage: "realisation", echeance: "2026-11-03" }, "2026-11-03")).toBeNull();
  });

  test("report : le rythme fixe repart de la date d'origine", () => {
    const haie = { intervalleValeur: 6, intervalleUnite: "mois", ancrage: "fixe", echeance: "2026-05-20", echeanceInitiale: "2026-05-01" };
    expect(prochaineEcheance(haie, "2026-05-20")).toBe("2026-11-01");
  });

  test("heures", () => {
    expect(lireHeure("14:00")).toBe("14:00");
    expect(lireHeure("9h30")).toBe("09:30");
    expect(lireHeure("14h")).toBe("14:00");
    expect(lireHeure("25:00")).toBeNull();
    expect(lireHeure("midi")).toBeNull();
    expect(libelleHeure("14:00", 90)).toBe("14 h – 15 h 30");
    expect(libelleHeure("09:30")).toBe("9 h 30");
  });

  test("heure locale → UTC, heure d'été comme d'hiver", () => {
    expect(instantLocal("2026-07-01", "14:00", "Europe/Paris").toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(instantLocal("2026-12-01", "14:00", "Europe/Paris").toISOString()).toBe("2026-12-01T13:00:00.000Z");
    // Jour du changement d'heure (29 mars 2026, 2 h → 3 h).
    expect(instantLocal("2026-03-29", "10:00", "Europe/Paris").toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });
});

describe("passer et reporter", () => {
  test("passer : noté « passé » dans l'historique, hors dépenses et dernières interventions ; échéance suivante", async () => {
    const el = await nouvelElement();
    const id = await ok("creerEntretien", { elementId: el, titre: "Sortir la poubelle jaune", intervalleValeur: 2, intervalleUnite: "semaine", echeance: jour });
    const suivante = await ok("passerEcheance", id, { motif: "  Absents  " });
    expect(suivante).toBe(ajouter(jour, 2, "semaine"));
    const f = await fiche(el);
    expect(f.entretiens[0]).toMatchObject({ echeance: suivante, actif: true, echeanceInitiale: null });
    expect(f.historique).toHaveLength(1);
    expect(f.historique[0]).toMatchObject({ date: jour, passee: true, note: "Absents", cout: null });
    const tdb = await ok("tableauDeBord");
    expect(tdb.dernieres.some((r: { entretienId: string }) => r.entretienId === id)).toBe(false);
  });

  test("passer un rendez-vous pris l'annule ; une action ponctuelle passée est close", async () => {
    const el = await nouvelElement("Chaudière");
    const rdv = await ok("creerEntretien", { elementId: el, titre: "Entretien annuel", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: jour });
    await ok("prendreRdv", rdv, { dateRdv: ajouter(jour, 3, "jour"), heureRdv: "14h" });
    await ok("passerEcheance", rdv);
    expect(await entretienDe(el, rdv)).toMatchObject({ etat: "a_faire", dateRdv: null, heureRdv: null, dureeRdvMinutes: null, echeance: ajouter(jour, 1, "an") });

    const unique = await ok("creerEntretien", { elementId: el, titre: "Purger les radiateurs", echeance: jour });
    expect(await ok("passerEcheance", unique)).toBeNull();
    expect((await entretienDe(el, unique)).actif).toBe(false);
  });

  test("reporter : seule cette échéance bouge ; une fois faite, le rythme reprend depuis la date d'origine", async () => {
    const el = await nouvelElement("Jardin");
    const id = await ok("creerEntretien", { elementId: el, titre: "Tailler la haie", intervalleValeur: 6, intervalleUnite: "mois", ancrage: "fixe", echeance: "2026-05-01" });
    await ok("reporterEcheance", id, { date: "2026-05-20" });
    expect(await entretienDe(el, id)).toMatchObject({ echeance: "2026-05-20", echeanceInitiale: "2026-05-01" });
    // Reporter encore garde la date d'origine ; revenir dessus efface le report.
    await ok("reporterEcheance", id, { date: "2026-05-25" });
    expect((await entretienDe(el, id)).echeanceInitiale).toBe("2026-05-01");
    await ok("realiserEntretien", id, { date: "2026-05-24" });
    expect(await entretienDe(el, id)).toMatchObject({ echeance: "2026-11-01", echeanceInitiale: null });

    await ok("reporterEcheance", id, { date: "2026-11-10" });
    await ok("reporterEcheance", id, { date: "2026-11-01" });
    expect((await entretienDe(el, id)).echeanceInitiale).toBeNull();
    expect(await refuse("reporterEcheance", id, { date: "bientôt" })).toBe(400);
  });

  test("modifier l'échéance à la main oublie le report", async () => {
    const el = await nouvelElement("Toiture");
    const id = await ok("creerEntretien", { elementId: el, titre: "Démoussage", intervalleValeur: 2, intervalleUnite: "an", ancrage: "fixe", echeance: "2027-04-01" });
    await ok("reporterEcheance", id, { date: "2027-05-01" });
    const e = await entretienDe(el, id);
    await ok("majEntretien", id, { echeance: "2027-06-01" }, e.modifieLe);
    expect(await entretienDe(el, id)).toMatchObject({ echeance: "2027-06-01", echeanceInitiale: null });
  });
});

describe("rendez-vous avec heure", () => {
  test("heure et durée ; 1 h par défaut ; refus d'une heure invalide ou sans date", async () => {
    const el = await nouvelElement("PAC");
    const id = await ok("creerEntretien", { elementId: el, titre: "Entretien PAC", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: jour });
    await ok("prendreRdv", id, { dateRdv: "2026-11-20", heureRdv: "14:00", dureeRdvMinutes: 90 });
    expect(await entretienDe(el, id)).toMatchObject({ etat: "rdv_pris", dateRdv: "2026-11-20", heureRdv: "14:00", dureeRdvMinutes: 90 });
    await ok("prendreRdv", id, { dateRdv: "2026-11-20", heureRdv: "9h30" });
    expect(await entretienDe(el, id)).toMatchObject({ heureRdv: "09:30", dureeRdvMinutes: 60 });
    await ok("prendreRdv", id, { dateRdv: "2026-11-20" });
    expect(await entretienDe(el, id)).toMatchObject({ heureRdv: null, dureeRdvMinutes: null });
    expect(await refuse("prendreRdv", id, { dateRdv: "2026-11-20", heureRdv: "25h" })).toBe(400);
    expect(await refuse("prendreRdv", id, { heureRdv: "14:00" })).toBe(400);
    await ok("annulerRdv", id);
    expect(await entretienDe(el, id)).toMatchObject({ etat: "a_faire", heureRdv: null });
  });

  test("agenda : créneau en UTC avec alarme une heure avant ; lien de la famille, régénéré par un admin", async () => {
    const el = await nouvelElement("Chaudière gaz");
    const id = await ok("creerEntretien", { elementId: el, titre: "Ramonage", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: jour });
    await ok("prendreRdv", id, { dateRdv: "2026-12-01", heureRdv: "14:00", dureeRdvMinutes: 90 });

    const etat = await (await s.requete("/api/notifications", { cookie })).json();
    expect(etat.ical.famille).toMatch(/^\/api\/ical\/[\w-]+\.ics$/);
    expect(etat.ical.famille).not.toBe(etat.ical.chemin);
    const r = await s.app.handle(new Request(`http://local${etat.ical.famille}`));
    expect(r.status).toBe(200);
    const ics = await r.text();
    expect(ics).toContain("X-WR-CALNAME:Custos Domus – famille");
    const evenement = ics.split("BEGIN:VEVENT").find((b) => b.includes(`UID:rdv-${id}@`))!;
    expect(evenement).toContain("DTSTART:20261201T130000Z");
    expect(evenement).toContain("DTEND:20261201T143000Z");
    expect(evenement).toContain("TRIGGER:-PT1H");
    expect(evenement).toContain("TRANSP:OPAQUE");

    const ecrivain = await s.compte("ecrivain-agenda@famille.fr", "ecriture");
    const vu = await (await s.requete("/api/notifications", { cookie: ecrivain.cookie })).json();
    expect(vu.ical.famille).toBe(etat.ical.famille);
    expect((await s.requete("/api/notifications/ical-famille", { methode: "POST", corps: {}, cookie: ecrivain.cookie })).status).toBe(403);
    const apres = await (await s.requete("/api/notifications/ical-famille", { methode: "POST", corps: {}, cookie })).json();
    expect(apres.ical.famille).not.toBe(etat.ical.famille);
    expect((await s.app.handle(new Request(`http://local${etat.ical.famille}`))).status).toBe(404);
  });
});
