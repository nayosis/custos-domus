import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, newId, query } from "../db/client";
import { maison, type Maison } from "../db/schema";
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
     where e.maison_id = ?1 or er.maison_id = ?1`,
    [id],
  );
  await db.delete(maison).where(eq(maison.id, id));
  await supprimerFichiers(fichiers.map((l) => l[0] as string));
}
