/*
 * Espace des enfants : connexion par prénom et code PIN (cookie à part), leurs missions, leurs récompenses.
 * Rien d'autre : un enfant n'a accès ni aux fonctions RPC ni aux fichiers.
 */
import { Elysia, t } from "elysia";
import { session } from "./auth";
import { creerSessionEnfant, DUREE_SESSION_LONGUE_MS, lireSessionEnfant, supprimerSessionEnfant } from "./comptes";
import { diffuser } from "./evenements";
import { ErreurMetier } from "./erreurs";
import { demanderRecompense, enfantActif, espaceEnfant, faireMission, verifierPin } from "./famille";
import { journaliser } from "./journal";
import { contexteRequete } from "./tracabilite";

export const COOKIE_ENFANT = "custos_enfant";

const estHttps = (request: Request) =>
  request.url.startsWith("https:") || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
const ipDe = (request: Request, ip?: string) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() || ip || "?";

// 10 codes faux par adresse IP en 15 minutes (en plus du blocage du profil au dixième code faux de suite).
const ECHECS_IP_MAX = 10;
const FENETRE_MS = 15 * 60 * 1000;
const echecs = new Map<string, { n: number; debut: number }>();
const epuise = (ip: string) => {
  const e = echecs.get(ip);
  if (e && Date.now() - e.debut > FENETRE_MS) echecs.delete(ip);
  return (echecs.get(ip)?.n ?? 0) >= ECHECS_IP_MAX;
};
const noterEchec = (ip: string) => {
  const e = echecs.get(ip);
  if (!e || Date.now() - e.debut > FENETRE_MS) echecs.set(ip, { n: 1, debut: Date.now() });
  else e.n++;
};
export const reinitialiserLimitationEnfants = () => echecs.clear();

/** L'enfant connecté, ou 401. */
async function exigerEnfant(jeton: unknown) {
  const id = lireSessionEnfant(typeof jeton === "string" ? jeton : undefined);
  const e = id ? await enfantActif(id) : null;
  if (!e) throw new ErreurMetier("Connexion requise", 401);
  return e;
}

/** Une écriture de l'enfant : tracée à son prénom, journalisée, diffusée aux parents connectés. */
async function ecrire<T>(prenom: string, fonction: string, args: unknown[], f: () => Promise<T>) {
  const par = `${prenom} (enfant)`;
  const r = await contexteRequete.run({ utilisateur: par }, f);
  journaliser(par, fonction, args, r);
  diffuser({ type: "modification", par, fonction });
  return r;
}

export const routesEnfants = new Elysia()
  .use(session)
  .post(
    "/api/enfant/connexion",
    async ({ body, cookie, request, server }) => {
      const ip = ipDe(request, server?.requestIP(request)?.address);
      if (epuise(ip)) throw new ErreurMetier("Trop d'essais : réessaie dans quelques minutes.", 429);
      const e = await verifierPin(body.prenom, body.pin);
      if (!e) {
        noterEchec(ip);
        throw new ErreurMetier("Prénom ou code incorrect.", 401);
      }
      cookie[COOKIE_ENFANT].set({
        value: creerSessionEnfant(e.id, body.souvenir),
        httpOnly: true,
        sameSite: "strict",
        secure: estHttps(request),
        path: "/",
        ...(body.souvenir ? { maxAge: DUREE_SESSION_LONGUE_MS / 1000 } : {}),
      });
      return { prenom: e.prenom };
    },
    { body: t.Object({ prenom: t.String({ maxLength: 40 }), pin: t.String({ maxLength: 20 }), souvenir: t.Boolean() }) },
  )
  .post("/api/enfant/deconnexion", ({ cookie }) => {
    const jeton = cookie[COOKIE_ENFANT]?.value;
    if (typeof jeton === "string") supprimerSessionEnfant(jeton);
    cookie[COOKIE_ENFANT].remove();
    return { ok: true };
  })
  .get("/api/enfant/moi", async ({ cookie }) => ({ prenom: (await exigerEnfant(cookie[COOKIE_ENFANT]?.value)).prenom }))
  .get("/api/enfant/espace", async ({ cookie }) => espaceEnfant((await exigerEnfant(cookie[COOKIE_ENFANT]?.value)).id))
  .post("/api/enfant/missions/:id/fait", async ({ cookie, params }) => {
    const e = await exigerEnfant(cookie[COOKIE_ENFANT]?.value);
    await ecrire(e.prenom, "faireMission", [params.id], () => faireMission(e.id, params.id));
    return espaceEnfant(e.id);
  })
  .post("/api/enfant/recompenses/:id/demander", async ({ cookie, params }) => {
    const e = await exigerEnfant(cookie[COOKIE_ENFANT]?.value);
    await ecrire(e.prenom, "demanderRecompense", [params.id], () => demanderRecompense(e.id, params.id));
    return espaceEnfant(e.id);
  });
