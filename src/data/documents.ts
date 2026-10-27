import { eq } from "drizzle-orm";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { db, newId, query } from "../db/client";
import { document } from "../db/schema";
import { estTypeDocument, MIME_PAR_EXTENSION, typeDevine } from "../lib/documents";
import { ErreurMetier } from "../../serveur/erreurs";
import { cheminFichier, nomValide, supprimerFichier } from "../../serveur/fichiers";

/**
 * Rattache un fichier déjà envoyé (POST /api/fichiers) à un élément ou à une réalisation.
 * Type MIME et taille sont relus sur le disque : le navigateur ne fournit que le nom et le type de document.
 */
export async function creerDocument(v: {
  elementId?: string | null;
  realisationId?: string | null;
  fichier: string;
  nom: string;
  type?: string | null;
  date?: string | null;
}) {
  if (!v.elementId === !v.realisationId) throw new ErreurMetier("Un document se rattache à un élément ou à une réalisation.");
  if (!nomValide(v.fichier) || !existsSync(cheminFichier(v.fichier))) throw new ErreurMetier("Fichier introuvable : renvoyez-le.");
  const mime = MIME_PAR_EXTENSION[extname(v.fichier).slice(1)];
  if (!mime) throw new ErreurMetier("Type de fichier non pris en charge.");
  if ((await query("select 1 from document where fichier = ?", [v.fichier])).length) throw new ErreurMetier("Ce fichier est déjà rattaché.");
  const nom = v.nom.trim() || v.fichier;
  const id = newId();
  await db.insert(document).values({
    id,
    elementId: v.elementId || null,
    realisationId: v.realisationId || null,
    type: estTypeDocument(v.type) ? v.type : typeDevine(nom, mime),
    nom,
    fichier: v.fichier,
    mime,
    taille: statSync(cheminFichier(v.fichier)).size,
    date: v.date || null,
  });
  return id;
}

/** Renommer, changer le type ou la date d'un document (le fichier, lui, ne change pas). */
export async function majDocument(id: string, patch: { nom?: string; type?: string; date?: string | null }) {
  const valeurs: Partial<typeof document.$inferInsert> = {};
  if (patch.nom !== undefined && patch.nom.trim()) valeurs.nom = patch.nom.trim();
  if (patch.type !== undefined) {
    if (!estTypeDocument(patch.type)) throw new ErreurMetier(`Type de document inconnu : ${patch.type}`);
    valeurs.type = patch.type;
  }
  if (patch.date !== undefined) valeurs.date = patch.date || null;
  if (Object.keys(valeurs).length) await db.update(document).set(valeurs).where(eq(document.id, id));
}

/** Supprime le document et son fichier. */
export async function supprimerDocument(id: string) {
  const [ligne] = await db.select({ fichier: document.fichier }).from(document).where(eq(document.id, id));
  if (!ligne) return;
  await db.delete(document).where(eq(document.id, id));
  await supprimerFichier(ligne.fichier);
}
