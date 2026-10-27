/*
 * Réglages de l'installation et préférences de rappel de chacun, dans comptes.db
 * (comme les comptes : ni sauvegardés ni restaurés avec les données).
 */
import webpush from "web-push";
import { baseComptes, emailValide } from "./comptes";

const lire = (cle: string) => baseComptes().query<{ valeur: string }, [string]>("SELECT valeur FROM reglage WHERE cle = ?").get(cle)?.valeur ?? null;
const ecrire = (cle: string, valeur: string) =>
  baseComptes().query("INSERT INTO reglage (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").run(cle, valeur);

// --- Envoi des e-mails (réglé par un admin dans l'application)

export type ConfigEnvoi = {
  fournisseur: "aucun" | "mailjet" | "smtp";
  /** Adresse d'expédition (doit être autorisée chez le fournisseur). */
  expediteur: string;
  /** Adresse de l'application, pour les liens des e-mails (https://maison.exemple.fr). */
  urlApplication: string;
  mailjet: { cleApi: string; cleSecrete: string };
  smtp: { hote: string; port: number; securise: boolean; utilisateur: string; motDePasse: string };
};

const ENVOI_VIDE: ConfigEnvoi = {
  fournisseur: "aucun",
  expediteur: "",
  urlApplication: "",
  mailjet: { cleApi: "", cleSecrete: "" },
  smtp: { hote: "", port: 587, securise: false, utilisateur: "", motDePasse: "" },
};

export function configEnvoi(): ConfigEnvoi {
  const brut = lire("envoi");
  if (!brut) return structuredClone(ENVOI_VIDE);
  const c = JSON.parse(brut) as Partial<ConfigEnvoi>;
  return { ...ENVOI_VIDE, ...c, mailjet: { ...ENVOI_VIDE.mailjet, ...c.mailjet }, smtp: { ...ENVOI_VIDE.smtp, ...c.smtp } };
}

/** La configuration montrée au navigateur : jamais les secrets, seulement s'ils sont définis. */
export function configEnvoiPublique() {
  const c = configEnvoi();
  return {
    ...c,
    mailjet: { cleApi: c.mailjet.cleApi, cleSecrete: "", secretDefini: !!c.mailjet.cleSecrete },
    smtp: { ...c.smtp, motDePasse: "", secretDefini: !!c.smtp.motDePasse },
  };
}

/** Enregistre la configuration ; un secret laissé vide garde l'ancien. Renvoie un message d'erreur, ou null. */
export function enregistrerConfigEnvoi(nouvelle: ConfigEnvoi): string | null {
  const ancienne = configEnvoi();
  const c: ConfigEnvoi = {
    fournisseur: nouvelle.fournisseur,
    expediteur: nouvelle.expediteur.trim(),
    urlApplication: nouvelle.urlApplication.trim().replace(/\/+$/, ""),
    mailjet: { cleApi: nouvelle.mailjet.cleApi.trim(), cleSecrete: nouvelle.mailjet.cleSecrete.trim() || ancienne.mailjet.cleSecrete },
    smtp: {
      hote: nouvelle.smtp.hote.trim(),
      port: nouvelle.smtp.port,
      securise: nouvelle.smtp.securise,
      utilisateur: nouvelle.smtp.utilisateur.trim(),
      motDePasse: nouvelle.smtp.motDePasse || ancienne.smtp.motDePasse,
    },
  };
  if (c.fournisseur !== "aucun" && !emailValide(c.expediteur)) return "Adresse d'expédition invalide.";
  if (c.urlApplication && !/^https?:\/\/[^\s/]+/.test(c.urlApplication)) return "Adresse de l'application invalide (https://…).";
  if (c.fournisseur === "mailjet" && (!c.mailjet.cleApi || !c.mailjet.cleSecrete)) return "Clé API et clé secrète Mailjet requises.";
  if (c.fournisseur === "smtp" && (!c.smtp.hote || !Number.isInteger(c.smtp.port) || c.smtp.port < 1 || c.smtp.port > 65535)) return "Serveur SMTP et port requis.";
  ecrire("envoi", JSON.stringify(c));
  return null;
}

export const envoiEmailPossible = () => configEnvoi().fournisseur !== "aucun";

// --- Notifications push : clés VAPID, créées au premier besoin

export function clesVapid() {
  const brut = lire("vapid");
  if (brut) return JSON.parse(brut) as { publicKey: string; privateKey: string };
  const cles = webpush.generateVAPIDKeys();
  ecrire("vapid", JSON.stringify(cles));
  return cles;
}

// --- Dernière tournée des rappels (date « AAAA-MM-JJ »)

export const derniereTournee = () => lire("derniere_tournee");
export const noterTournee = (jour: string) => ecrire("derniere_tournee", jour);

// --- Préférences de chacun

export type Preferences = { email: boolean; push: boolean; jetonIcal: string };

const nouveauJeton = () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");

/** Préférences d'un compte (créées au premier accès : e-mail et push activés, lien d'agenda tiré au sort). */
export function preferences(utilisateurId: string): Preferences {
  const base = baseComptes();
  const l = base.query<{ email: number; push: number; jeton_ical: string | null }, [string]>("SELECT email, push, jeton_ical FROM preference WHERE utilisateur_id = ?").get(utilisateurId);
  if (!l) {
    base.query("INSERT INTO preference (utilisateur_id, jeton_ical) VALUES (?, ?)").run(utilisateurId, nouveauJeton());
    return preferences(utilisateurId);
  }
  if (!l.jeton_ical) {
    base.query("UPDATE preference SET jeton_ical = ? WHERE utilisateur_id = ?").run(nouveauJeton(), utilisateurId);
    return preferences(utilisateurId);
  }
  return { email: !!l.email, push: !!l.push, jetonIcal: l.jeton_ical };
}

export function majPreferences(utilisateurId: string, patch: { email?: boolean; push?: boolean }) {
  preferences(utilisateurId);
  if (patch.email !== undefined) baseComptes().query("UPDATE preference SET email = ? WHERE utilisateur_id = ?").run(patch.email ? 1 : 0, utilisateurId);
  if (patch.push !== undefined) baseComptes().query("UPDATE preference SET push = ? WHERE utilisateur_id = ?").run(patch.push ? 1 : 0, utilisateurId);
}

/** Nouveau lien d'agenda : l'ancien cesse de fonctionner (lien partagé par erreur…). */
export function regenererJetonIcal(utilisateurId: string) {
  preferences(utilisateurId);
  baseComptes().query("UPDATE preference SET jeton_ical = ? WHERE utilisateur_id = ?").run(nouveauJeton(), utilisateurId);
}

/** Compte actif à qui appartient ce lien d'agenda, ou null. */
export const utilisateurDuJetonIcal = (jeton: string) =>
  baseComptes()
    .query<{ id: string }, [string]>("SELECT u.id FROM preference p JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.jeton_ical = ? AND u.actif = 1")
    .get(jeton)?.id ?? null;

// --- Abonnements push

export type AbonnementPush = { endpoint: string; p256dh: string; auth: string; appareil: string | null };

export function abonner(utilisateurId: string, a: AbonnementPush) {
  baseComptes()
    .query(
      `INSERT INTO abonnement_push (endpoint, utilisateur_id, p256dh, auth, appareil) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET utilisateur_id = excluded.utilisateur_id, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil`,
    )
    .run(a.endpoint, utilisateurId, a.p256dh, a.auth, a.appareil);
}

export const desabonner = (endpoint: string) => baseComptes().query("DELETE FROM abonnement_push WHERE endpoint = ?").run(endpoint);

export const abonnementsDe = (utilisateurId: string) =>
  baseComptes().query<AbonnementPush, [string]>("SELECT endpoint, p256dh, auth, appareil FROM abonnement_push WHERE utilisateur_id = ? ORDER BY cree_le").all(utilisateurId);

/** Comptes actifs, avec leurs préférences : les destinataires de la tournée des rappels. */
export function destinataires() {
  const comptes = baseComptes().query<{ id: string; email: string }, []>("SELECT id, email FROM utilisateur WHERE actif = 1").all();
  return comptes.map((c) => ({ id: c.id, adresse: c.email, ...preferences(c.id) }));
}
