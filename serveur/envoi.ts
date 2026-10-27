/*
 * Envoi des e-mails (API Mailjet ou serveur SMTP, selon les réglages) et des notifications push.
 * Les tests remplacent ces envois par des fonctions qui les enregistrent (`remplacerEnvois`).
 */
import nodemailer from "nodemailer";
import webpush from "web-push";
import { clesVapid, configEnvoi, desabonner, type AbonnementPush, type ConfigEnvoi } from "./reglages";

export type Message = { sujet: string; texte: string; html: string };
export type Notification = { titre: string; corps: string; url: string };
type ResultatPush = "ok" | "expire" | string;

type Envois = {
  email: (destinataire: string, m: Message, config: ConfigEnvoi) => Promise<void>;
  push: (a: AbonnementPush, n: Notification) => Promise<ResultatPush>;
};

async function emailReel(destinataire: string, m: Message, c: ConfigEnvoi) {
  if (c.fournisseur === "mailjet") {
    const r = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${c.mailjet.cleApi}:${c.mailjet.cleSecrete}`).toString("base64")}` },
      body: JSON.stringify({
        Messages: [{ From: { Email: c.expediteur, Name: "Custos Domus" }, To: [{ Email: destinataire }], Subject: m.sujet, TextPart: m.texte, HTMLPart: m.html }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      const corps = (await r.json().catch(() => ({}))) as { ErrorMessage?: string; Messages?: { Errors?: { ErrorMessage: string }[] }[] };
      throw new Error(`Mailjet ${r.status} : ${corps.Messages?.[0]?.Errors?.[0]?.ErrorMessage ?? corps.ErrorMessage ?? r.statusText}`);
    }
    return;
  }
  if (c.fournisseur === "smtp") {
    const transport = nodemailer.createTransport({
      host: c.smtp.hote,
      port: c.smtp.port,
      secure: c.smtp.securise,
      auth: c.smtp.utilisateur ? { user: c.smtp.utilisateur, pass: c.smtp.motDePasse } : undefined,
      connectionTimeout: 20_000,
    });
    await transport.sendMail({ from: { name: "Custos Domus", address: c.expediteur }, to: destinataire, subject: m.sujet, text: m.texte, html: m.html });
    return;
  }
  throw new Error("Aucun moyen d'envoi d'e-mails n'est réglé.");
}

async function pushReel(a: AbonnementPush, n: Notification): Promise<ResultatPush> {
  const { publicKey, privateKey } = clesVapid();
  const c = configEnvoi();
  // Le service de push veut un contact : l'adresse de l'application, ou celle d'expédition.
  const sujet = c.urlApplication.startsWith("https://") ? c.urlApplication : c.expediteur ? `mailto:${c.expediteur}` : "mailto:custos-domus@example.org";
  try {
    await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(n), {
      vapidDetails: { subject: sujet, publicKey, privateKey },
      TTL: 24 * 3600,
      timeout: 20_000,
    });
    return "ok";
  } catch (e) {
    const statut = (e as { statusCode?: number }).statusCode;
    // Appareil désabonné (application désinstallée, notifications refusées) : on l'oublie.
    if (statut === 404 || statut === 410) {
      desabonner(a.endpoint);
      return "expire";
    }
    return (e as Error).message;
  }
}

let envois: Envois = { email: emailReel, push: pushReel };

/** Tests : remplace les envois réels. */
export const remplacerEnvois = (e: Partial<Envois>) => {
  envois = { ...envois, ...e };
};

export const envoyerEmail = (destinataire: string, m: Message) => envois.email(destinataire, m, configEnvoi());
export const envoyerPush = (a: AbonnementPush, n: Notification) => envois.push(a, n);
