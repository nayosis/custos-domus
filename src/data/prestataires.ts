import { asc, eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { prestataire, type Prestataire } from "../db/schema";
import { ErreurMetier } from "../../serveur/erreurs";
import { sansTrace, verifierVersion, versionDe } from "./version";

type Saisie = Partial<Record<keyof Pick<Prestataire, "nom" | "metier" | "telephone" | "email" | "notes">, string | null>>;

/** Textes rognés, champs vides → null. */
function nettoyer(v: Saisie) {
  const r: Saisie = {};
  for (const k of ["nom", "metier", "telephone", "email", "notes"] as const) {
    const x = v[k];
    if (x !== undefined) r[k] = typeof x === "string" ? x.trim() || null : null;
  }
  return r;
}

export const listePrestataires = () => db.select().from(prestataire).orderBy(asc(prestataire.nom));

export async function creerPrestataire(v: Saisie & { nom: string }) {
  const valeurs = nettoyer(v);
  if (!valeurs.nom) throw new ErreurMetier("Le nom est obligatoire.");
  const id = newId();
  await db.insert(prestataire).values({ ...valeurs, id, nom: valeurs.nom });
  return id;
}

export async function majPrestataire(id: string, patch: Saisie, version?: string | null) {
  await verifierVersion("prestataire", id, version);
  const valeurs = nettoyer(sansTrace(patch));
  if ("nom" in patch && !valeurs.nom) throw new ErreurMetier("Le nom est obligatoire.");
  // Nom vérifié ci-dessus : jamais null.
  await db.update(prestataire).set(valeurs as Partial<Prestataire>).where(eq(prestataire.id, id));
  return versionDe("prestataire", id);
}

/** Les entretiens et l'historique qui le citaient restent, sans prestataire. */
export const supprimerPrestataire = (id: string) => db.delete(prestataire).where(eq(prestataire.id, id));
