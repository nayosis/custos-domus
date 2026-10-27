import { describe, expect, test } from "bun:test";
import { remplacerEnvois, type Message, type Notification } from "../serveur/envoi";
import { calculerRappels, composer, envoyerRappels, type chargerSuivi } from "../serveur/rappels";
import { derniereTournee } from "../serveur/reglages";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const emails: { a: string; m: Message }[] = [];
const notifications: { endpoint: string; n: Notification }[] = [];
remplacerEnvois({
  email: async (a, m) => {
    emails.push({ a, m });
  },
  push: async (a, n) => {
    notifications.push({ endpoint: a.endpoint, n });
    return "ok";
  },
});

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const api = async (chemin: string, options: { methode?: string; corps?: unknown; cookie?: string } = {}) => {
  const r = await s.requete(chemin, { cookie, ...options });
  return { statut: r.status, corps: await r.json().catch(() => null) };
};

type Suivi = Awaited<ReturnType<typeof chargerSuivi>>;
const entretien = (p: Partial<Suivi["entretiens"][number]>): Suivi["entretiens"][number] => ({
  id: crypto.randomUUID(),
  titre: "Entretien",
  nature: "tache",
  echeance: "2026-12-01",
  delaiAlerteJours: 7,
  etat: "a_faire",
  dateRdv: null,
  actif: true,
  notes: null,
  elementId: "el",
  elementNom: "PAC",
  maisonNom: "Maison",
  prestataireNom: null,
  prestataireTelephone: null,
  ...p,
});

describe("calcul des rappels", () => {
  // Mardi 3 novembre 2026 ; lundi 2 novembre.
  const suivi: Suivi = {
    entretiens: [
      entretien({ titre: "Vidange", nature: "rdv", echeance: "2026-12-15", delaiAlerteJours: 42 }), // fenêtre ouverte le 3 nov.
      entretien({ titre: "Filtre", echeance: "2026-11-02" }), // en retard depuis le 3 nov.
      entretien({ titre: "Chaudière", nature: "rdv", etat: "rdv_pris", dateRdv: "2026-11-04", echeance: "2026-11-01", prestataireNom: "Martin", prestataireTelephone: "06 12" }),
      entretien({ titre: "Ramonage", echeance: "2027-03-01" }),
    ],
    garanties: [{ id: "g", nom: "Lave-linge", maisonNom: "Maison", finGarantie: "2026-12-03" }],
  };

  test("alertes du jour : fenêtre qui s'ouvre, retard, rendez-vous demain, garantie à un mois ; pas de récapitulatif le mardi", async () => {
    const r = await calculerRappels("2026-11-03", "2026-11-02", { suivi });
    expect(r.alertes.map((a) => (a.type === "garantie" ? `garantie:${a.g.nom}` : `${a.type}:${a.e.titre}`)).sort()).toEqual([
      "a_prevoir:Vidange",
      "en_retard:Filtre",
      "garantie:Lave-linge",
      "rdv_demain:Chaudière",
    ]);
    expect(r.recap).toBeNull();
    // Le lendemain : plus rien de nouveau.
    expect((await calculerRappels("2026-11-04", "2026-11-03", { suivi })).alertes).toEqual([]);
  });

  test("le lundi : récapitulatif de ce qui attend ; jours manqués rattrapés", async () => {
    const lundi = await calculerRappels("2026-11-02", "2026-11-01", { suivi });
    // Le filtre arrive à échéance ce jour-là : à prévoir (0 jour), pas encore en retard.
    expect(lundi.recap?.aPrevoir.map((e) => e.titre)).toEqual(["Filtre"]);
    expect(lundi.recap?.rendezVous.map((e) => e.titre)).toEqual(["Chaudière"]);
    // Serveur arrêté du 2 au 4 : la tournée du 5 rattrape les alertes du 3 et le récapitulatif du lundi 2.
    const rattrapage = await calculerRappels("2026-11-05", "2026-11-01", { suivi });
    expect(rattrapage.alertes).toHaveLength(4);
    expect(rattrapage.recap?.enRetard.map((e) => e.titre)).toEqual(["Filtre"]);
    expect(rattrapage.recap?.aPrevoir.map((e) => e.titre)).toEqual(["Vidange"]);
  });

  test("message : sujet, texte, HTML échappé, notification", async () => {
    const r = await calculerRappels("2026-11-03", "2026-11-02", { suivi: { entretiens: [suivi.entretiens[2]], garanties: [] } });
    const m = composer(r, "https://maison.exemple.fr")!;
    expect(m.sujet).toBe("Rendez-vous demain : Chaudière");
    expect(m.texte).toContain("Martin, 06 12");
    expect(m.html).toContain('href="https://maison.exemple.fr"');
    expect(m.push).toMatchObject({ titre: "Rendez-vous demain : Chaudière", corps: "PAC, Maison (Martin, 06 12)" });
    const piege = await calculerRappels("2026-11-03", "2026-11-02", { suivi: { entretiens: [{ ...suivi.entretiens[1], titre: "<script>x</script>" }], garanties: [] } });
    expect(composer(piege, "")!.html).not.toContain("<script>");
    expect(composer({ jour: "2026-11-03", alertes: [], recap: null }, "")).toBeNull();
  });
});

describe("préférences et agenda", () => {
  test("préférences par défaut, modification ; flux iCal par lien secret, régénéré", async () => {
    const etat = await api("/api/notifications");
    expect(etat.statut).toBe(200);
    expect(etat.corps).toMatchObject({ email: { actif: true, possible: false }, push: { actif: true, appareils: [] } });
    expect(etat.corps.push.clePublique).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect((await api("/api/notifications", { methode: "PUT", corps: { push: false } })).corps.push.actif).toBe(false);
    await api("/api/notifications", { methode: "PUT", corps: { push: true } });

    const maison = await ok("creerMaison", { nom: "Maison" });
    const el = await ok("creerElement", { maisonId: maison, nom: "Fosse septique", finGarantie: ajouter(aujourdhui(), 3, "mois") });
    await ok("creerEntretien", { elementId: el, titre: "Vidange, avec bordereau", nature: "rdv", intervalleValeur: 4, intervalleUnite: "an", echeance: ajouter(aujourdhui(), 2, "mois") });

    const chemin = etat.corps.ical.chemin as string;
    const r = await s.app.handle(new Request(`http://local${chemin}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/calendar");
    const ics = await r.text();
    expect(ics).toStartWith("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("SUMMARY:Prendre RDV : Vidange\\, avec bordereau – Fosse septique");
    expect(ics).toContain(`DTSTART;VALUE=DATE:${ajouter(aujourdhui(), 2, "mois").replace(/-/g, "")}`);
    expect(ics).toContain("SUMMARY:Fin de garantie : Fosse septique");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);

    await api("/api/notifications/ical", { methode: "POST" });
    expect((await s.app.handle(new Request(`http://local${chemin}`))).status).toBe(404);
    expect((await s.app.handle(new Request("http://local/api/ical/nimporte-quoi.ics"))).status).toBe(404);
  });

  test("abonnement push, essai, retrait ; un autre compte ne peut pas retirer l'appareil", async () => {
    const abonnement = { endpoint: "https://push.exemple.org/abc", p256dh: "cle", auth: "secret", appareil: "Téléphone" };
    expect((await api("/api/notifications/abonnements", { corps: { ...abonnement, endpoint: "http://local/x" } })).statut).toBe(400);
    expect((await api("/api/notifications/abonnements", { corps: abonnement })).corps.push.appareils).toEqual([{ endpoint: abonnement.endpoint, appareil: "Téléphone" }]);
    const essai = await api("/api/notifications/essai", { corps: { canal: "push" } });
    expect(essai.corps.message).toBe("Notification envoyée à 1 appareil.");
    expect(notifications.at(-1)?.endpoint).toBe(abonnement.endpoint);

    const autre = await s.compte("autre@famille.fr", "ecriture");
    await api("/api/notifications/abonnements/retirer", { corps: { endpoint: abonnement.endpoint }, cookie: autre.cookie });
    expect((await api("/api/notifications")).corps.push.appareils).toHaveLength(1);
    await api("/api/notifications/abonnements/retirer", { corps: { endpoint: abonnement.endpoint } });
    expect((await api("/api/notifications")).corps.push.appareils).toEqual([]);
  });
});

describe("envoi des e-mails", () => {
  const config = {
    fournisseur: "mailjet",
    expediteur: "rappels@exemple.fr",
    urlApplication: "https://maison.exemple.fr/",
    mailjet: { cleApi: "cle", cleSecrete: "secret" },
    smtp: { hote: "", port: 587, securise: false, utilisateur: "", motDePasse: "" },
  };

  test("réglages réservés aux admins ; secrets jamais renvoyés, gardés si laissés vides", async () => {
    const ecrivain = await s.compte("ecrivain@famille.fr", "ecriture");
    expect((await api("/api/reglages/envoi", { cookie: ecrivain.cookie })).statut).toBe(403);
    expect((await api("/api/reglages/envoi", { methode: "PUT", corps: { ...config, expediteur: "pas une adresse" } })).statut).toBe(400);

    const enregistre = await api("/api/reglages/envoi", { methode: "PUT", corps: config });
    expect(enregistre.statut).toBe(200);
    expect(enregistre.corps).toMatchObject({ urlApplication: "https://maison.exemple.fr", mailjet: { cleApi: "cle", cleSecrete: "", secretDefini: true } });
    await api("/api/reglages/envoi", { methode: "PUT", corps: { ...config, mailjet: { cleApi: "cle2", cleSecrete: "" } } });
    expect((await api("/api/reglages/envoi")).corps.mailjet).toEqual({ cleApi: "cle2", cleSecrete: "", secretDefini: true });
    expect((await api("/api/notifications")).corps.email.possible).toBe(true);
  });

  test("essai d'e-mail : rien en vue, message de bienvenue", async () => {
    const essai = await api("/api/notifications/essai", { corps: { canal: "email" } });
    expect(essai.statut).toBe(200);
    expect(emails.at(-1)?.a).toBe(SUPER.email);
    expect(emails.at(-1)?.m.sujet).toBe("Custos Domus : les rappels fonctionnent");
  });

  test("tournée : chacun selon ses canaux ; notée pour ne pas repartir", async () => {
    const maison = await ok("creerMaison", { nom: "Location" });
    const el = await ok("creerElement", { maisonId: maison, nom: "Chaudière" });
    const e = await ok("creerEntretien", { elementId: el, titre: "Entretien annuel", nature: "rdv", intervalleValeur: 1, intervalleUnite: "an", echeance: aujourdhui() });
    await ok("prendreRdv", e, { dateRdv: ajouter(aujourdhui(), 1, "jour") });
    // Le compte « autre » ne veut pas d'e-mails.
    const autre = await s.connexion("autre@famille.fr", "mot-de-passe-solide");
    await api("/api/notifications", { methode: "PUT", corps: { email: false }, cookie: autre.cookie });

    emails.length = 0;
    const bilan = await envoyerRappels();
    expect(bilan.alertes).toBeGreaterThanOrEqual(1);
    expect(emails.map((x) => x.a).sort()).toEqual(["ecrivain@famille.fr", SUPER.email].sort());
    expect(emails[0].m.texte).toContain("Rendez-vous demain : Entretien annuel");
    expect(derniereTournee()).toBe(aujourdhui());
  });
});
