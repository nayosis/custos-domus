/*
 * Missions confiées aux enfants : à qui elles sont confiées (un enfant, ou partagées), points, validation par un parent.
 * Côté serveur uniquement (appelé par les fonctions de src/data/ et par l'espace des enfants).
 */
import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { echange, enfant, entretien, missionTour, realisation } from "../src/db/schema";
import { aujourdhui } from "../src/lib/dates";
import { debutSemaine, finSemaine, POINTS_DEFAUT, VALIDATION_AUTO_HEURES } from "../src/lib/famille";
import { ErreurMetier } from "./erreurs";

export type SaisieMission = { enfants: string[]; points?: number | null } | null;

/** Les enfants à qui une mission est confiée. */
export const enfantsMission = async (entretienId: string) =>
  (await db.select({ enfantId: missionTour.enfantId }).from(missionTour).where(eq(missionTour.entretienId, entretienId)).orderBy(asc(missionTour.ordre))).map((t) => t.enfantId);

/** Un seul enfant : la mission est la sienne (entretien.enfantId) ; plusieurs : partagée (vide), le premier qui la fait gagne les points. */
const titulaire = (enfants: string[]) => (enfants.length === 1 ? enfants[0] : null);

/**
 * Fait de cette chose à faire une mission, confiée à un ou plusieurs enfants, ou plus du tout (null).
 * Partagée entre plusieurs : n'importe lequel peut la faire, celui qui la fait gagne les points.
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
  await db.update(entretien).set({ points: pts, enfantId: titulaire(enfants) }).where(eq(entretien.id, entretienId));
}

/** Est-ce une mission de cet enfant (la sienne, ou partagée avec lui) ? */
export async function missionDe(entretienId: string, enfantId: string) {
  const [t] = await db
    .select({ enfantId: missionTour.enfantId })
    .from(missionTour)
    .where(and(eq(missionTour.entretienId, entretienId), eq(missionTour.enfantId, enfantId)));
  return !!t;
}

/** Enfant supprimé : ses missions restent aux autres (seul restant : elle devient la sienne) ; plus personne, plus une mission. */
export async function reparerMissions() {
  const missions = await db.select({ id: entretien.id, enfantId: entretien.enfantId }).from(entretien).where(isNotNull(entretien.points));
  for (const { id, enfantId } of missions) {
    const enfants = await enfantsMission(id);
    if (!enfants.length) await db.update(entretien).set({ points: null, enfantId: null }).where(eq(entretien.id, id));
    else if (titulaire(enfants) !== enfantId) await db.update(entretien).set({ enfantId: titulaire(enfants) }).where(eq(entretien.id, id));
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
