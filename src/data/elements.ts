import { asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db, newId, query } from "../db/client";
import { document, element, entretien, maison, prestataire, realisation, type Element } from "../db/schema";
import { aujourdhui } from "../lib/dates";
import { ajouter, estRecurrent, type Unite } from "../lib/entretiens";
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

/** Fiche d'un élément : l'élément, sa maison, ses documents, ses entretiens, son historique, ce qu'il a remplacé. */
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
  const [entretiens, realisations] = await Promise.all([
    db
      .select({ ...getTableColumns(entretien), prestataireNom: prestataire.nom })
      .from(entretien)
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(eq(entretien.elementId, id))
      .orderBy(desc(entretien.actif), asc(entretien.echeance)),
    db
      .select({ ...getTableColumns(realisation), prestataireNom: prestataire.nom })
      .from(realisation)
      .leftJoin(prestataire, eq(prestataire.id, realisation.prestataireId))
      .where(eq(realisation.elementId, id))
      .orderBy(desc(realisation.date), desc(realisation.creeLe)),
  ]);
  const piecesJointes = realisations.length
    ? await db.select().from(document).where(inArray(document.realisationId, realisations.map((r) => r.id))).orderBy(asc(document.nom))
    : [];
  const historique = realisations.map((r) => ({ ...r, documents: piecesJointes.filter((d) => d.realisationId === r.id) }));
  const remplacant = ligne.element.remplacePar
    ? ((await db.select({ id: element.id, nom: element.nom }).from(element).where(eq(element.id, ligne.element.remplacePar)))[0] ?? null)
    : null;
  return { ...ligne, documents, entretiens, historique, remplace, remplacant };
}

/**
 * Remplace un équipement : le nouveau est créé dans la même maison, l'ancien est archivé avec son historique.
 * `reprendreEntretiens` : les entretiens actifs sont recopiés sur le nouveau, avec une première échéance
 * comptée depuis sa mise en service (à défaut son achat, ou aujourd'hui) ; ceux de l'ancien sont arrêtés.
 */
export async function remplacerElement(id: string, nouveau: Saisie & { nom: string }, reprendreEntretiens = true) {
  const [ancien] = await db.select().from(element).where(eq(element.id, id));
  if (!ancien) throw new ErreurMetier("Élément introuvable", 404);
  const valeurs = nettoyer(nouveau);
  if (!valeurs.nom) throw new ErreurMetier("Le nom est obligatoire.");
  const nouvelId = newId();
  await db.insert(element).values({ categorie: ancien.categorie, emplacement: ancien.emplacement, ...valeurs, id: nouvelId, maisonId: ancien.maisonId, nom: valeurs.nom });
  const depart = valeurs.dateMiseEnService ?? valeurs.dateAchat ?? aujourdhui();
  const actifs = (await db.select().from(entretien).where(eq(entretien.elementId, id))).filter((e) => e.actif);
  for (const e of actifs) {
    if (reprendreEntretiens)
      await db.insert(entretien).values({
        id: newId(),
        elementId: nouvelId,
        titre: e.titre,
        nature: e.nature,
        intervalleValeur: e.intervalleValeur,
        intervalleUnite: e.intervalleUnite,
        ancrage: e.ancrage,
        echeance: estRecurrent(e) ? ajouter(depart, e.intervalleValeur!, e.intervalleUnite as Unite) : e.echeance,
        delaiAlerteJours: e.delaiAlerteJours,
        prestataireId: e.prestataireId,
        notes: e.notes,
      });
    await db.update(entretien).set({ actif: false }).where(eq(entretien.id, e.id));
  }
  await db.update(element).set({ archive: true, remplacePar: nouvelId }).where(eq(element.id, id));
  return nouvelId;
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
