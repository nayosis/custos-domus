/*
 * Famille, côté parents : profils des enfants, missions faites à valider, récompenses et demandes.
 * (Les enfants, eux, passent par /api/enfant : cf. serveur/famille.ts.)
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, newId } from "../db/client";
import { echange, element, enfant, entretien, maison, missionTour, realisation, recompense } from "../db/schema";
import { aujourdhui } from "../lib/dates";
import { ECHECS_PIN_MAX, OBJECTIF_DEFAUT } from "../lib/famille";
import { ErreurMetier } from "../../serveur/erreurs";
import { hacherPin, prevenirEnfant } from "../../serveur/famille";
import { compteDe, reparerMissions, enfantsMission as enfantsDeMission, validerAutomatiquement } from "../../serveur/missions";
import { supprimerSessionsEnfant } from "../../serveur/comptes";
import { supprimerAbonnementsEnfant } from "../../serveur/reglages";
import { utilisateurCourant } from "../../serveur/tracabilite";

const prenomValide = (p: unknown) => {
  const r = typeof p === "string" ? p.trim() : "";
  if (!r || r.length > 40) throw new ErreurMetier("Le prénom est obligatoire (40 caractères au plus).");
  return r;
};
const objectifValide = (n: unknown) => {
  if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 10000) throw new ErreurMetier("Objectif : un nombre entier de points.");
  return n as number;
};
const pointsValides = (n: unknown) => {
  if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 100000) throw new ErreurMetier("Points : un nombre entier positif.");
  return n as number;
};

async function prenomLibre(prenom: string, sauf?: string) {
  const memes = await db
    .select({ id: enfant.id })
    .from(enfant)
    .where(sql`lower(${enfant.prenom}) = ${prenom.toLowerCase()}`);
  if (memes.some((m) => m.id !== sauf)) throw new ErreurMetier("Un enfant porte déjà ce prénom : il sert à se connecter.");
}

/** Pour choisir à qui confier une mission. */
export const listeEnfants = () =>
  db.select({ id: enfant.id, prenom: enfant.prenom, actif: enfant.actif }).from(enfant).orderBy(desc(enfant.actif), asc(enfant.prenom));

/** Les enfants à qui une mission est confiée. */
export const enfantsMission = (entretienId: string) => enfantsDeMission(entretienId);

const ou = sql<string | null>`coalesce(${element.nom}, ${maison.nom})`;

/** La page Famille : chaque enfant (semaine, solde, missions), ce qui attend une réponse, les récompenses. */
export async function famille() {
  await validerAutomatiquement();
  const jour = aujourdhui();
  const [enfants, missions, aValider, recentes, demandes, recompenses] = await Promise.all([
    db.select().from(enfant).orderBy(desc(enfant.actif), asc(enfant.prenom)),
    db
      .select({ id: entretien.id, titre: entretien.titre, echeance: entretien.echeance, points: entretien.points, enfantId: entretien.enfantId, ou, elementId: entretien.elementId, maisonId: sql<string | null>`${maison.id}` })
      .from(entretien)
      .leftJoin(element, eq(element.id, entretien.elementId))
      .leftJoin(maison, sql`${maison.id} = coalesce(${entretien.maisonId}, ${element.maisonId})`)
      .where(and(eq(entretien.actif, true), isNotNull(entretien.points)))
      .orderBy(asc(entretien.echeance)),
    db
      .select({ id: realisation.id, titre: realisation.titre, date: realisation.date, points: realisation.points, enfantId: realisation.enfantId, creeLe: realisation.creeLe })
      .from(realisation)
      .where(eq(realisation.validation, "a_valider"))
      .orderBy(asc(realisation.creeLe)),
    db
      .select({ id: realisation.id, titre: realisation.titre, date: realisation.date, points: realisation.points, enfantId: realisation.enfantId, validation: realisation.validation, validePar: realisation.validePar })
      .from(realisation)
      .where(inArray(realisation.validation, ["validee", "refusee"]))
      .orderBy(desc(realisation.date), desc(realisation.creeLe), desc(sql`${realisation}.rowid`))
      .limit(20),
    db.select().from(echange).orderBy(desc(echange.creeLe), desc(sql`${echange}.rowid`)).limit(20),
    db.select().from(recompense).orderBy(desc(recompense.actif), asc(recompense.points)),
  ]);
  const tours = missions.length
    ? await db
        .select()
        .from(missionTour)
        .where(inArray(missionTour.entretienId, missions.map((m) => m.id)))
        .orderBy(asc(missionTour.ordre))
    : [];
  return {
    enfants: await Promise.all(
      enfants.map(async (e) => ({
        id: e.id,
        prenom: e.prenom,
        objectifSemaine: e.objectifSemaine,
        actif: e.actif,
        bloque: e.echecsPin >= ECHECS_PIN_MAX,
        ...(await compteDe(e.id, jour)),
      })),
    ),
    missions: missions.map((m) => ({ ...m, enfants: tours.filter((t) => t.entretienId === m.id).map((t) => t.enfantId) })),
    aValider,
    recentes,
    demandes,
    recompenses,
  };
}

// --- Profils

export async function creerEnfant(v: { prenom: string; pin: string; objectifSemaine?: number | null }) {
  const prenom = prenomValide(v.prenom);
  await prenomLibre(prenom);
  const id = newId();
  await db.insert(enfant).values({ id, prenom, pinHash: await hacherPin(v.pin), objectifSemaine: v.objectifSemaine == null ? OBJECTIF_DEFAUT : objectifValide(v.objectifSemaine) });
  return id;
}

/** Prénom, objectif ; désactivé : ne peut plus se connecter (ses sessions sont fermées). */
export async function majEnfant(id: string, v: { prenom?: string; objectifSemaine?: number; actif?: boolean }) {
  const patch: Partial<typeof enfant.$inferInsert> = {};
  if (v.prenom !== undefined) {
    patch.prenom = prenomValide(v.prenom);
    await prenomLibre(patch.prenom, id);
  }
  if (v.objectifSemaine !== undefined) patch.objectifSemaine = objectifValide(v.objectifSemaine);
  if (v.actif !== undefined) patch.actif = !!v.actif;
  if (Object.keys(patch).length) await db.update(enfant).set(patch).where(eq(enfant.id, id));
  if (v.actif === false) {
    supprimerSessionsEnfant(id);
    supprimerAbonnementsEnfant(id);
  }
  return id;
}

/** Nouveau code (débloque le profil) ; les sessions ouvertes avec l'ancien sont fermées. */
export async function changerPin(id: string, v: { pin: string }) {
  await db.update(enfant).set({ pinHash: await hacherPin(v.pin), echecsPin: 0 }).where(eq(enfant.id, id));
  supprimerSessionsEnfant(id);
  return id;
}

/** Supprime le profil, ses points et ses demandes ; ses missions partagées restent aux autres (ou ne sont plus des missions). */
export async function supprimerEnfant(id: string) {
  await db.update(realisation).set({ enfantId: null, points: null, validation: null, avant: null }).where(eq(realisation.enfantId, id));
  await db.delete(enfant).where(eq(enfant.id, id));
  supprimerSessionsEnfant(id);
  supprimerAbonnementsEnfant(id);
  await reparerMissions();
}

// --- Validation

async function aValider(realisationId: string) {
  const [r] = await db.select().from(realisation).where(eq(realisation.id, realisationId));
  if (!r || !r.validation) throw new ErreurMetier("Mission introuvable", 404);
  if (r.validation !== "a_valider") throw new ErreurMetier("Déjà traitée.");
  return r;
}

export async function validerMission(realisationId: string) {
  const r = await aValider(realisationId);
  await db.update(realisation).set({ validation: "validee", validePar: utilisateurCourant(), valideLe: new Date().toISOString() }).where(eq(realisation.id, realisationId));
  if (r.enfantId) prevenirEnfant(r.enfantId, { titre: "Mission validée", corps: `${r.titre} : +${r.points ?? 0} pts`, tag: `custos-mission-${r.id}` });
}

/**
 * Pas fait (ou mal fait) : aucun point. Si rien n'a été fait depuis sur cette mission, elle revient
 * comme avant (même échéance, même enfant) ; l'occurrence reste dans l'historique, refusée.
 */
export async function refuserMission(realisationId: string, v: { motif?: string | null } = {}) {
  const r = await aValider(realisationId);
  await db
    .update(realisation)
    .set({ validation: "refusee", validePar: utilisateurCourant(), valideLe: new Date().toISOString(), ...(v.motif?.trim() ? { note: v.motif.trim() } : {}) })
    .where(eq(realisation.id, realisationId));
  if (r.enfantId) prevenirEnfant(r.enfantId, { titre: "Mission refusée", corps: v.motif?.trim() ? `${r.titre} : ${v.motif.trim()}` : r.titre, tag: `custos-mission-${r.id}` });
  if (!r.entretienId || !r.avant) return;
  const [derniere] = await db
    .select({ id: realisation.id })
    .from(realisation)
    .where(eq(realisation.entretienId, r.entretienId))
    .orderBy(desc(sql`rowid`))
    .limit(1);
  if (derniere?.id !== realisationId) return;
  const avant = JSON.parse(r.avant) as Partial<typeof entretien.$inferSelect>;
  await db
    .update(entretien)
    .set({
      echeance: avant.echeance,
      echeanceInitiale: avant.echeanceInitiale ?? null,
      actif: avant.actif ?? true,
      enfantId: avant.enfantId ?? null,
      etat: avant.etat ?? "a_faire",
      dateRdv: avant.dateRdv ?? null,
      heureRdv: avant.heureRdv ?? null,
      dureeRdvMinutes: avant.dureeRdvMinutes ?? null,
    })
    .where(eq(entretien.id, r.entretienId));
}

// --- Récompenses

export async function creerRecompense(v: { titre: string; points: number }) {
  const titre = v.titre?.trim();
  if (!titre) throw new ErreurMetier("Le titre est obligatoire.");
  const id = newId();
  await db.insert(recompense).values({ id, titre, points: pointsValides(v.points) });
  return id;
}

export async function majRecompense(id: string, v: { titre?: string; points?: number; actif?: boolean }) {
  const patch: Partial<typeof recompense.$inferInsert> = {};
  if (v.titre !== undefined) {
    patch.titre = v.titre.trim();
    if (!patch.titre) throw new ErreurMetier("Le titre est obligatoire.");
  }
  if (v.points !== undefined) patch.points = pointsValides(v.points);
  if (v.actif !== undefined) patch.actif = !!v.actif;
  if (Object.keys(patch).length) await db.update(recompense).set(patch).where(eq(recompense.id, id));
  return id;
}

/** Les demandes déjà faites gardent leur titre et leurs points. */
export const supprimerRecompense = (id: string) => db.delete(recompense).where(eq(recompense.id, id));

async function repondre(id: string, statut: "accordee" | "refusee") {
  const [d] = await db.select().from(echange).where(eq(echange.id, id));
  if (!d) throw new ErreurMetier("Demande introuvable", 404);
  if (d.statut !== "demandee") throw new ErreurMetier("Déjà traitée.");
  await db.update(echange).set({ statut, reponduPar: utilisateurCourant(), reponduLe: new Date().toISOString() }).where(eq(echange.id, id));
  prevenirEnfant(d.enfantId, {
    titre: statut === "accordee" ? "Récompense accordée" : "Récompense refusée",
    corps: statut === "accordee" ? d.titre : `${d.titre} : tes ${d.points} pts te sont rendus`,
    tag: `custos-echange-${d.id}`,
  });
}
/** Accordée : les points sont dépensés. */
export const accorderEchange = (id: string) => repondre(id, "accordee");
/** Refusée : les points reviennent. */
export const refuserEchange = (id: string) => repondre(id, "refusee");
