import { asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db, newId, query } from "../db/client";
import { document, element, maison, type Element } from "../db/schema";
import { ErreurMetier } from "../../serveur/erreurs";
import { supprimerFichiers } from "../../serveur/fichiers";
import { sansTrace, verifierVersion, versionDe } from "./version";

type Saisie = Partial<Omit<Element, "id" | "creeLe" | "creePar" | "modifiePar" | "modifieLe">>;

const TEXTES = ["nom", "categorie", "emplacement", "marque", "modele", "numeroSerie", "dateAchat", "dateMiseEnService", "vendeur", "finGarantie", "notes"] as const;

/** Textes rognés, champs vides → null ; l'identifiant et la date de création ne viennent jamais du navigateur. */
function nettoyer(v: Saisie & { id?: unknown; creeLe?: unknown }) {
  const { id: _id, creeLe: _c, ...reste } = sansTrace(v);
  const r: Saisie = { ...reste };
  for (const k of TEXTES) {
    const x = r[k];
    if (typeof x === "string") (r as Record<string, unknown>)[k] = x.trim() || null;
  }
  if (r.prix !== undefined && (r.prix === null || !Number.isFinite(r.prix))) r.prix = null;
  return r;
}

/** Tous les éléments (actifs d'abord), avec leur maison et leur nombre de documents. */
export const listeElements = () =>
  db
    .select({
      ...getTableColumns(element),
      maisonNom: maison.nom,
      maisonArchivee: maison.archivee,
      nbDocuments: sql<number>`(select count(*) from document d where d.element_id = "element"."id")`,
    })
    .from(element)
    .innerJoin(maison, eq(maison.id, element.maisonId))
    .orderBy(asc(element.archive), asc(maison.nom), asc(element.nom));

/** Fiche d'un élément : l'élément, sa maison, ses documents, ce qu'il a remplacé. */
export async function ficheElement(id: string) {
  const [ligne] = await db
    .select({ element, maison: { id: maison.id, nom: maison.nom, archivee: maison.archivee } })
    .from(element)
    .innerJoin(maison, eq(maison.id, element.maisonId))
    .where(eq(element.id, id));
  if (!ligne) throw new ErreurMetier("Élément introuvable", 404);
  const [documents, remplace] = await Promise.all([
    db.select().from(document).where(eq(document.elementId, id)).orderBy(desc(document.creeLe), asc(document.nom)),
    db.select({ id: element.id, nom: element.nom }).from(element).where(eq(element.remplacePar, id)),
  ]);
  const remplacant = ligne.element.remplacePar
    ? ((await db.select({ id: element.id, nom: element.nom }).from(element).where(eq(element.id, ligne.element.remplacePar)))[0] ?? null)
    : null;
  return { ...ligne, documents, remplace, remplacant };
}

export async function creerElement(v: Saisie & { maisonId: string; nom: string }) {
  const valeurs = nettoyer(v);
  if (!valeurs.nom) throw new ErreurMetier("Le nom est obligatoire.");
  const id = newId();
  await db.insert(element).values({ ...valeurs, id, maisonId: v.maisonId, nom: valeurs.nom });
  return id;
}

export async function majElement(id: string, patch: Saisie, version?: string | null) {
  await verifierVersion("element", id, version);
  const valeurs = nettoyer(patch);
  if ("nom" in patch && !valeurs.nom) throw new ErreurMetier("Le nom est obligatoire.");
  await db.update(element).set(valeurs).where(eq(element.id, id));
  return versionDe("element", id);
}

/** Supprime l'élément, son historique et ses documents (fichiers compris). */
export async function supprimerElement(id: string) {
  const fichiers = await query(
    `select fichier from document where element_id = ?1
     or realisation_id in (select id from realisation where element_id = ?1)`,
    [id],
  );
  await db.delete(element).where(eq(element.id, id));
  await supprimerFichiers(fichiers.map((l) => l[0] as string));
}
