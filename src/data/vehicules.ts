import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, newId } from "../db/client";
import { element, entretien, realisation, releve, type Element } from "../db/schema";
import { aujourdhui, lireDate } from "../lib/dates";
import { dernierReleve, rythmeKm } from "../lib/vehicules";
import { ErreurMetier } from "../../serveur/erreurs";
import { ajouterReleve, recalculerKm, relevesDe } from "../../serveur/kilometrage";

type Saisie = Partial<Pick<Element, "nom" | "marque" | "modele" | "immatriculation" | "dateMiseEnService" | "dateAchat" | "prix" | "notes">>;

const date = (d: unknown, champ: string) => {
  const r = typeof d === "string" ? lireDate(d) : null;
  if (!r) throw new ErreurMetier(`${champ} : date invalide.`);
  return r;
};

/**
 * Les véhicules (actifs d'abord), avec leur dernier relevé, leur rythme de roulage, la prochaine chose à faire
 * et les dépenses de l'année.
 */
export async function listeVehicules() {
  const annee = aujourdhui().slice(0, 4);
  const vehicules = await db.select().from(element).where(eq(element.type, "vehicule")).orderBy(asc(element.archive), asc(element.nom));
  return Promise.all(
    vehicules.map(async (v) => {
      const [releves, [prochaine], [depenses]] = await Promise.all([
        relevesDe(v.id),
        db
          .select()
          .from(entretien)
          .where(and(eq(entretien.elementId, v.id), eq(entretien.actif, true)))
          .orderBy(asc(entretien.echeance))
          .limit(1),
        db
          .select({ total: sql<number>`coalesce(sum(${realisation.cout}), 0)` })
          .from(realisation)
          .where(and(eq(realisation.elementId, v.id), gte(realisation.date, `${annee}-01-01`))),
      ]);
      return { ...v, dernierReleve: dernierReleve(releves), rythme: rythmeKm(releves), prochaine: prochaine ?? null, depensesAnnee: depenses?.total ?? 0 };
    }),
  );
}

/** Nouveau véhicule ; le kilométrage actuel, s'il est donné, devient le premier relevé. */
export async function creerVehicule(v: Saisie & { nom: string; km?: number | null }) {
  const nom = v.nom?.trim();
  if (!nom) throw new ErreurMetier("Le nom est obligatoire.");
  const id = newId();
  await db.insert(element).values({
    id,
    type: "vehicule",
    categorie: "Véhicule",
    nom,
    marque: v.marque?.trim() || null,
    modele: v.modele?.trim() || null,
    immatriculation: v.immatriculation?.trim().toUpperCase() || null,
    dateMiseEnService: v.dateMiseEnService ? date(v.dateMiseEnService, "Mise en circulation") : null,
    dateAchat: v.dateAchat ? date(v.dateAchat, "Achat") : null,
    prix: v.prix ?? null,
    notes: v.notes?.trim() || null,
  });
  if (v.km != null) await ajouterReleve(id, aujourdhui(), v.km);
  return id;
}

/** Relevé du compteur (aujourd'hui par défaut) ; les échéances au kilométrage sont recalculées. */
export async function releverCompteur(elementId: string, v: { km: number; date?: string | null }) {
  const [vehicule] = await db.select({ type: element.type }).from(element).where(eq(element.id, elementId));
  if (vehicule?.type !== "vehicule") throw new ErreurMetier("Véhicule introuvable", 404);
  const id = await ajouterReleve(elementId, v.date ? date(v.date, "Date") : aujourdhui(), v.km);
  await recalculerKm(elementId);
  return id;
}

/** Relevé saisi par erreur. */
export async function supprimerReleve(id: string) {
  const [r] = await db.select().from(releve).where(eq(releve.id, id));
  if (!r) return;
  await db.delete(releve).where(eq(releve.id, id));
  await recalculerKm(r.elementId);
}

/** Les derniers relevés d'un véhicule, du plus récent au plus ancien. */
export const historiqueReleves = (elementId: string) => db.select().from(releve).where(eq(releve.elementId, elementId)).orderBy(desc(releve.date), desc(releve.km));
