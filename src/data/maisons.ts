import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db, newId, query } from "../db/client";
import { document, element, entretien, maison, prestataire, realisation, type Maison } from "../db/schema";
import { ErreurMetier } from "../../serveur/erreurs";
import { supprimerFichiers } from "../../serveur/fichiers";
import { sansTrace, verifierVersion, versionDe } from "./version";

/** Maisons, actives d'abord, avec leur nombre d'éléments suivis (non archivés). */
export const listeMaisons = () =>
  db
    .select({
      ...getTableColumns(maison),
      nbElements: sql<number>`(select count(*) from element e where e.maison_id = "maison"."id" and e.archive = 0)`,
    })
    .from(maison)
    .orderBy(asc(maison.archivee), asc(maison.nom));

export async function creerMaison(v: { nom: string; adresse?: string | null; notes?: string | null }) {
  const id = newId();
  await db.insert(maison).values({ id, nom: v.nom.trim(), adresse: v.adresse || null, notes: v.notes || null });
  return id;
}

export async function majMaison(id: string, patch: Partial<Maison>, version?: string | null) {
  await verifierVersion("maison", id, version);
  await db.update(maison).set(sansTrace(patch)).where(eq(maison.id, id));
  return versionDe("maison", id);
}

/** Supprime la maison et tout ce qui s'y rattache (éléments, entretiens, historique, documents et leurs fichiers). */
export async function supprimerMaison(id: string) {
  const fichiers = await query(
    `select d.fichier from document d
     left join element e on e.id = d.element_id
     left join realisation r on r.id = d.realisation_id
     left join element er on er.id = r.element_id
     where e.maison_id = ?1 or er.maison_id = ?1 or r.maison_id = ?1`,
    [id],
  );
  await db.delete(maison).where(eq(maison.id, id));
  await supprimerFichiers(fichiers.map((l) => l[0] as string));
}

/**
 * Page « À faire » d'une maison : ce qui se fait sur la maison elle-même (routines, tâches sans élément) avec
 * son historique, et en lecture ce qui est à faire sur ses éléments suivis.
 */
export async function aFaireMaison(id: string) {
  const [m] = await db.select({ id: maison.id, nom: maison.nom, archivee: maison.archivee }).from(maison).where(eq(maison.id, id));
  if (!m) throw new ErreurMetier("Maison introuvable", 404);
  const [entretiens, realisations, surElements] = await Promise.all([
    db
      .select({ ...getTableColumns(entretien), prestataireNom: prestataire.nom })
      .from(entretien)
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(eq(entretien.maisonId, id))
      .orderBy(desc(entretien.actif), asc(entretien.echeance)),
    db
      .select({ ...getTableColumns(realisation), prestataireNom: prestataire.nom })
      .from(realisation)
      .leftJoin(prestataire, eq(prestataire.id, realisation.prestataireId))
      .where(eq(realisation.maisonId, id))
      .orderBy(desc(realisation.date), desc(realisation.creeLe)),
    db
      .select({ ...getTableColumns(entretien), elementNom: element.nom, prestataireNom: prestataire.nom })
      .from(entretien)
      .innerJoin(element, eq(element.id, entretien.elementId))
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(and(eq(element.maisonId, id), eq(element.archive, false), eq(entretien.actif, true)))
      .orderBy(asc(entretien.echeance)),
  ]);
  const piecesJointes = realisations.length
    ? await db.select().from(document).where(inArray(document.realisationId, realisations.map((r) => r.id))).orderBy(asc(document.nom))
    : [];
  const historique = realisations.map((r) => ({ ...r, documents: piecesJointes.filter((d) => d.realisationId === r.id) }));
  return { maison: m, entretiens, historique, surElements };
}
