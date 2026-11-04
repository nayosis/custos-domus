/*
 * Kilométrage des véhicules, côté serveur : relevés du compteur et recalcul des échéances des entretiens
 * « au premier atteint » (temps ou kilométrage). Utilisé par src/data/ (jamais envoyé au navigateur).
 */
import { and, asc, desc, eq, gt, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { db, newId } from "../src/db/client";
import { entretien, releve } from "../src/db/schema";
import { aujourdhui } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { dateAuKm, dernierReleve, echeanceAuPremier } from "../src/lib/vehicules";
import { ErreurMetier } from "./erreurs";

export const relevesDe = (elementId: string) => db.select().from(releve).where(eq(releve.elementId, elementId)).orderBy(asc(releve.date), asc(releve.km));

/** Kilométrage du dernier relevé, ou null. */
export const dernierKm = async (elementId: string) => dernierReleve(await relevesDe(elementId))?.km ?? null;

/**
 * Nouveau relevé. Le compteur ne recule pas : refusé s'il est inférieur à un relevé antérieur ou supérieur
 * à un relevé postérieur. Un relevé identique (même jour, même kilométrage) n'est pas répété.
 */
export async function ajouterReleve(elementId: string, date: string, km: number) {
  if (!Number.isInteger(km) || km < 0 || km > 5_000_000) throw new ErreurMetier("Kilométrage invalide.");
  const [avant] = await db
    .select()
    .from(releve)
    .where(and(eq(releve.elementId, elementId), lte(releve.date, date), gt(releve.km, km)))
    .orderBy(desc(releve.km));
  if (avant) throw new ErreurMetier(`Le compteur indiquait déjà ${avant.km.toLocaleString("fr-FR")} km le ${avant.date.split("-").reverse().join("/")}.`);
  const [apres] = await db
    .select()
    .from(releve)
    .where(and(eq(releve.elementId, elementId), gt(releve.date, date), lt(releve.km, km)))
    .orderBy(asc(releve.km));
  if (apres) throw new ErreurMetier(`Le compteur n'indiquait que ${apres.km.toLocaleString("fr-FR")} km le ${apres.date.split("-").reverse().join("/")}.`);
  const [deja] = await db.select().from(releve).where(and(eq(releve.elementId, elementId), eq(releve.date, date), eq(releve.km, km)));
  if (deja) return deja.id;
  const id = newId();
  await db.insert(releve).values({ id, elementId, date, km });
  return id;
}

/**
 * Échéances des entretiens au kilométrage d'un véhicule : la plus proche de l'échéance au temps et de la date
 * estimée d'après les relevés. Sans estimation possible ni échéance au temps : dans un an, en attendant des relevés.
 * Une échéance reportée à la main n'est pas touchée.
 */
export async function recalculerKm(elementId: string) {
  const releves = await relevesDe(elementId);
  const suivis = await db
    .select()
    .from(entretien)
    .where(and(eq(entretien.elementId, elementId), eq(entretien.actif, true), isNotNull(entretien.intervalleKm), isNotNull(entretien.kmEcheance), isNull(entretien.echeanceInitiale)));
  for (const e of suivis) {
    const echeance = echeanceAuPremier(e.echeanceTemps, dateAuKm(e.kmEcheance!, releves)) ?? ajouter(dernierReleve(releves)?.date ?? aujourdhui(), 1, "an");
    if (echeance !== e.echeance) await db.update(entretien).set({ echeance }).where(eq(entretien.id, e.id));
  }
}
