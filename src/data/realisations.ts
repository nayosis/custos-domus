import { eq } from "drizzle-orm";
import { db, newId, query } from "../db/client";
import { realisation, type Realisation } from "../db/schema";
import { lireDate } from "../lib/dates";
import { ErreurMetier } from "../../serveur/erreurs";
import { supprimerFichiers } from "../../serveur/fichiers";
import { ajouterReleve, recalculerKm } from "../../serveur/kilometrage";
import { rattachement, type Rattachement } from "./entretiens";
import { verifierVersion, versionDe } from "./version";

type Saisie = Partial<Pick<Realisation, "date" | "titre" | "note" | "cout" | "prestataireId" | "kilometrage">>;

/** Champs vérifiés : date valide, titre non vide, coût positif ; vides → null. */
function nettoyer(v: Saisie) {
  const r: Saisie = {};
  if (v.date !== undefined) {
    const d = typeof v.date === "string" ? lireDate(v.date) : null;
    if (!d) throw new ErreurMetier("Date invalide.");
    r.date = d;
  }
  if (v.titre !== undefined) {
    r.titre = (v.titre ?? "").trim();
    if (!r.titre) throw new ErreurMetier("Le titre est obligatoire.");
  }
  if (v.note !== undefined) r.note = v.note?.trim() || null;
  if (v.cout !== undefined) {
    if (v.cout != null && (!Number.isFinite(v.cout) || v.cout < 0)) throw new ErreurMetier("Coût invalide.");
    r.cout = v.cout ?? null;
  }
  if (v.prestataireId !== undefined) r.prestataireId = v.prestataireId || null;
  if (v.kilometrage !== undefined) {
    if (v.kilometrage != null && (!Number.isInteger(v.kilometrage) || v.kilometrage < 0 || v.kilometrage > 5_000_000)) throw new ErreurMetier("Kilométrage invalide.");
    r.kilometrage = v.kilometrage ?? null;
  }
  return r;
}

/** Intervention ponctuelle consignée après coup (réparation, dépannage…), sur un élément ou la maison. */
export async function creerRealisation(v: Saisie & Rattachement & { date: string; titre: string }) {
  const ou = rattachement(v);
  const valeurs = nettoyer(v);
  const id = newId();
  // Véhicule : le kilométrage noté devient un relevé du compteur.
  if (valeurs.kilometrage != null && ou.elementId) {
    await ajouterReleve(ou.elementId, valeurs.date!, valeurs.kilometrage);
    await recalculerKm(ou.elementId);
  }
  await db.insert(realisation).values({ ...valeurs, id, ...ou, date: valeurs.date!, titre: valeurs.titre! });
  return id;
}

export async function majRealisation(id: string, patch: Saisie, version?: string | null) {
  await verifierVersion("realisation", id, version);
  await db.update(realisation).set(nettoyer(patch)).where(eq(realisation.id, id));
  return versionDe("realisation", id);
}

/** Supprime la réalisation et ses documents (l'échéance de l'entretien, elle, ne bouge pas). */
export async function supprimerRealisation(id: string) {
  const fichiers = await query("select fichier from document where realisation_id = ?", [id]);
  await db.delete(realisation).where(eq(realisation.id, id));
  await supprimerFichiers(fichiers.map((l) => l[0] as string));
}
