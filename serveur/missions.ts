/*
 * Missions confiées aux enfants : qui s'en charge (à tour de rôle), points, validation par un parent.
 * Côté serveur uniquement (appelé par les fonctions de src/data/ et par l'espace des enfants).
 */
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { echange, enfant, entretien, missionTour, realisation } from "../src/db/schema";
import { aujourdhui } from "../src/lib/dates";
import { debutSemaine, finSemaine, POINTS_DEFAUT, VALIDATION_AUTO_HEURES } from "../src/lib/famille";
import { ErreurMetier } from "./erreurs";

export type SaisieMission = { enfants: string[]; points?: number | null } | null;

/** Les enfants d'une mission, dans l'ordre du tour. */
export const tourDe = async (entretienId: string) =>
  (await db.select({ enfantId: missionTour.enfantId }).from(missionTour).where(eq(missionTour.entretienId, entretienId)).orderBy(asc(missionTour.ordre))).map((t) => t.enfantId);

/**
 * Fait de cette chose à faire une mission (un enfant : attribuée ; plusieurs : à tour de rôle), ou plus du tout (null).
 * Le tour en cours est gardé si son enfant fait toujours partie de la liste.
 */
export async function definirMission(entretienId: string, m: SaisieMission) {
  const enfants = [...new Set(m?.enfants ?? [])];
  await db.delete(missionTour).where(eq(missionTour.entretienId, entretienId));
  if (!enfants.length) {
    await db.update(entretien).set({ points: null, enfantId: null }).where(eq(entretien.id, entretienId));
    return;
  }
  const pts = m?.points ?? POINTS_DEFAUT;
  if (!Number.isInteger(pts) || pts < 0 || pts > 1000) throw new ErreurMetier("Points : un nombre entier de 0 à 1 000.");
  const connus = await db.select({ id: enfant.id }).from(enfant).where(inArray(enfant.id, enfants));
  if (connus.length !== enfants.length) throw new ErreurMetier("Enfant inconnu.");
  await db.insert(missionTour).values(enfants.map((enfantId, ordre) => ({ entretienId, enfantId, ordre })));
  const [e] = await db.select({ enfantId: entretien.enfantId }).from(entretien).where(eq(entretien.id, entretienId));
  await db
    .update(entretien)
    .set({ points: pts, enfantId: e?.enfantId && enfants.includes(e.enfantId) ? e.enfantId : enfants[0] })
    .where(eq(entretien.id, entretienId));
}

/** Après une occurrence (faite ou passée) : à tour de rôle, la mission passe à l'enfant suivant (actif). */
export async function tourSuivant(entretienId: string) {
  const [e] = await db.select({ enfantId: entretien.enfantId, points: entretien.points }).from(entretien).where(eq(entretien.id, entretienId));
  if (!e || e.points == null) return;
  const tour = await db
    .select({ enfantId: missionTour.enfantId, actif: enfant.actif })
    .from(missionTour)
    .innerJoin(enfant, eq(enfant.id, missionTour.enfantId))
    .where(eq(missionTour.entretienId, entretienId))
    .orderBy(asc(missionTour.ordre));
  if (tour.length < 2) return;
  const i = tour.findIndex((t) => t.enfantId === e.enfantId);
  for (let k = 1; k <= tour.length; k++) {
    const suivant = tour[(Math.max(i, 0) + k) % tour.length];
    if (suivant.actif) {
      await db.update(entretien).set({ enfantId: suivant.enfantId }).where(eq(entretien.id, entretienId));
      return;
    }
  }
}

/** Enfant retiré d'une mission (supprimé) : le tour passe au premier qui reste ; plus personne, plus une mission. */
export async function reparerMissions() {
  const orphelines = await db.select({ id: entretien.id }).from(entretien).where(and(isNotNull(entretien.points), sql`${entretien.enfantId} is null`));
  for (const { id } of orphelines) {
    const tour = await tourDe(id);
    await db
      .update(entretien)
      .set(tour.length ? { enfantId: tour[0] } : { points: null })
      .where(eq(entretien.id, id));
  }
}

/** Les missions faites restées sans réponse 48 h sont validées d'office. */
export const validerAutomatiquement = () =>
  db
    .update(realisation)
    .set({ validation: "validee", validePar: "auto", valideLe: new Date().toISOString() })
    .where(and(eq(realisation.validation, "a_valider"), lte(realisation.creeLe, sql`datetime('now', ${`-${VALIDATION_AUTO_HEURES} hours`})`)));

/** Points de la semaine (validés, et en attente de validation) et solde (validés, moins les récompenses demandées ou accordées). */
export async function compteDe(enfantId: string, jour = aujourdhui()) {
  const [[semaine], [gagnes], [depenses]] = await Promise.all([
    db
      .select({
        validees: sql<number>`coalesce(sum(case when ${realisation.validation} = 'validee' then ${realisation.points} end), 0)`,
        enAttente: sql<number>`coalesce(sum(case when ${realisation.validation} = 'a_valider' then ${realisation.points} end), 0)`,
      })
      .from(realisation)
      .where(and(eq(realisation.enfantId, enfantId), gte(realisation.date, debutSemaine(jour)), lte(realisation.date, finSemaine(jour)))),
    db
      .select({ n: sql<number>`coalesce(sum(${realisation.points}), 0)` })
      .from(realisation)
      .where(and(eq(realisation.enfantId, enfantId), eq(realisation.validation, "validee"))),
    db
      .select({ n: sql<number>`coalesce(sum(${echange.points}), 0)` })
      .from(echange)
      .where(and(eq(echange.enfantId, enfantId), inArray(echange.statut, ["demandee", "accordee"]))),
  ]);
  return { semaine: { validees: semaine?.validees ?? 0, enAttente: semaine?.enAttente ?? 0, debut: debutSemaine(jour) }, solde: (gagnes?.n ?? 0) - (depenses?.n ?? 0) };
}
