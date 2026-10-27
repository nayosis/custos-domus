import { asc, eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { maison, type Maison } from "../db/schema";
import { sansTrace, verifierVersion, versionDe } from "./version";

/** Maisons, actives d'abord. */
export const listeMaisons = () => db.select().from(maison).orderBy(asc(maison.archivee), asc(maison.nom));

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

/** Supprime la maison et tout ce qui s'y rattache (éléments, entretiens, historique). */
export const supprimerMaison = (id: string) => db.delete(maison).where(eq(maison.id, id));
