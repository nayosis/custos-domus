/*
 * Routes des rappels : préférences de chacun (e-mail, push, agenda), abonnements push, essais,
 * réglages d'envoi des e-mails (admins) et flux d'agenda public (protégé par son lien secret).
 */
import { Elysia, t } from "elysia";
import { aujourdhui } from "../src/lib/dates";
import { exiger, session } from "./auth";
import { envoyerEmail, envoyerPush } from "./envoi";
import { ErreurMetier } from "./erreurs";
import { genererIcal } from "./ical";
import { calculerRappels, composer } from "./rappels";
import {
  abonnementsDe, abonner, clesVapid, configEnvoi, configEnvoiPublique, desabonner, enregistrerConfigEnvoi, envoiEmailPossible, majPreferences, preferences,
  regenererJetonIcal, utilisateurDuJetonIcal,
} from "./reglages";

/** Ce que voit un compte sur sa page Notifications. */
function etat(utilisateurId: string) {
  const p = preferences(utilisateurId);
  return {
    email: { actif: p.email, possible: envoiEmailPossible() },
    push: { actif: p.push, clePublique: clesVapid().publicKey, appareils: abonnementsDe(utilisateurId).map((a) => ({ endpoint: a.endpoint, appareil: a.appareil })) },
    ical: { chemin: `/api/ical/${p.jetonIcal}.ics` },
  };
}

/** Message d'essai : les rappels réels du moment (récapitulatif compris), ou un message de bienvenue. */
async function messageEssai() {
  const r = await calculerRappels(aujourdhui(), null, { recap: true });
  return (
    composer(r, configEnvoi().urlApplication) ?? {
      sujet: "Custos Domus : les rappels fonctionnent",
      texte: "Tout est à jour pour l'instant. Vous serez prévenu ici à l'approche des prochains entretiens.",
      html: "<p>Tout est à jour pour l'instant. Vous serez prévenu ici à l'approche des prochains entretiens.</p>",
      push: { titre: "Custos Domus", corps: "Les notifications fonctionnent : tout est à jour pour l'instant.", url: "/" },
    }
  );
}

const SCHEMA_ENVOI = t.Object({
  fournisseur: t.Union([t.Literal("aucun"), t.Literal("mailjet"), t.Literal("smtp")]),
  expediteur: t.String(),
  urlApplication: t.String(),
  mailjet: t.Object({ cleApi: t.String(), cleSecrete: t.String() }),
  smtp: t.Object({ hote: t.String(), port: t.Number(), securise: t.Boolean(), utilisateur: t.String(), motDePasse: t.String() }),
});

export const routesRappels = new Elysia()
  .use(session)

  // --- Préférences du compte connecté
  .get("/api/notifications", ({ utilisateur }) => etat(exiger(utilisateur, "ecriture").id))
  .put(
    "/api/notifications",
    ({ utilisateur, body }) => {
      const u = exiger(utilisateur, "ecriture");
      majPreferences(u.id, body);
      return etat(u.id);
    },
    { body: t.Object({ email: t.Optional(t.Boolean()), push: t.Optional(t.Boolean()) }) },
  )
  .post("/api/notifications/ical", ({ utilisateur }) => {
    const u = exiger(utilisateur, "ecriture");
    regenererJetonIcal(u.id);
    return etat(u.id);
  })
  .post(
    "/api/notifications/abonnements",
    ({ utilisateur, body }) => {
      const u = exiger(utilisateur, "ecriture");
      if (!/^https:\/\//.test(body.endpoint)) throw new ErreurMetier("Abonnement invalide.");
      abonner(u.id, { endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, appareil: body.appareil?.slice(0, 100) ?? null });
      return etat(u.id);
    },
    { body: t.Object({ endpoint: t.String({ maxLength: 2000 }), p256dh: t.String({ maxLength: 200 }), auth: t.String({ maxLength: 100 }), appareil: t.Optional(t.String()) }) },
  )
  .post(
    "/api/notifications/abonnements/retirer",
    ({ utilisateur, body }) => {
      const u = exiger(utilisateur, "ecriture");
      if (abonnementsDe(u.id).some((a) => a.endpoint === body.endpoint)) desabonner(body.endpoint);
      return etat(u.id);
    },
    { body: t.Object({ endpoint: t.String() }) },
  )
  .post(
    "/api/notifications/essai",
    async ({ utilisateur, body }) => {
      const u = exiger(utilisateur, "ecriture");
      const m = await messageEssai();
      if (body.canal === "email") {
        if (!envoiEmailPossible()) throw new ErreurMetier("L'envoi des e-mails n'est pas encore réglé par un administrateur.");
        try {
          await envoyerEmail(u.email, m);
        } catch (e) {
          throw new ErreurMetier(`Échec de l'envoi : ${(e as Error).message}`, 502);
        }
        return { ok: true, message: `E-mail envoyé à ${u.email}.` };
      }
      const appareils = abonnementsDe(u.id);
      if (!appareils.length) throw new ErreurMetier("Aucun appareil abonné : activez les notifications sur cet appareil.");
      const resultats = await Promise.all(appareils.map((a) => envoyerPush(a, m.push)));
      const ok = resultats.filter((r) => r === "ok").length;
      const erreur = resultats.find((r) => r !== "ok" && r !== "expire");
      if (!ok) throw new ErreurMetier(erreur ? `Échec de la notification : ${erreur}` : "Les appareils abonnés ne sont plus joignables : réactivez les notifications.", 502);
      return { ok: true, message: `Notification envoyée à ${ok} appareil${ok > 1 ? "s" : ""}.` };
    },
    { body: t.Object({ canal: t.Union([t.Literal("email"), t.Literal("push")]) }) },
  )

  // --- Envoi des e-mails : réglé par un admin
  .get("/api/reglages/envoi", ({ utilisateur, request }) => {
    exiger(utilisateur, "admin");
    const c = configEnvoiPublique();
    // Proposition pour les liens des e-mails : l'adresse par laquelle l'admin consulte l'application.
    const origine = request.headers.get("origin") ?? request.headers.get("referer")?.replace(/^(https?:\/\/[^/]+).*$/, "$1") ?? "";
    return { ...c, urlApplication: c.urlApplication || origine };
  })
  .put(
    "/api/reglages/envoi",
    ({ utilisateur, body }) => {
      exiger(utilisateur, "admin");
      const erreur = enregistrerConfigEnvoi(body);
      if (erreur) throw new ErreurMetier(erreur);
      return configEnvoiPublique();
    },
    { body: SCHEMA_ENVOI },
  )

  // --- Flux d'agenda : public, le lien secret tient lieu de connexion
  .get("/api/ical/:fichier", async ({ params, set }) => {
    const id = utilisateurDuJetonIcal(params.fichier.replace(/\.ics$/, ""));
    if (!id) throw new ErreurMetier("Agenda introuvable", 404);
    set.headers["content-type"] = "text/calendar; charset=utf-8";
    set.headers["cache-control"] = "private, max-age=900";
    return genererIcal();
  });
