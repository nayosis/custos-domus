import { asc, eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { entretien, modeleEntretien, realisation, type Entretien } from "../db/schema";
import { aujourdhui, lireDate } from "../lib/dates";
import { ajouter, DELAI_DEFAUT, estNature, estRecurrent, estUnite, prochaineEcheance, type Unite } from "../lib/entretiens";
import { ErreurMetier } from "../../serveur/erreurs";
import { verifierVersion, versionDe } from "./version";

type Saisie = Partial<
  Pick<Entretien, "titre" | "nature" | "intervalleValeur" | "intervalleUnite" | "ancrage" | "echeance" | "delaiAlerteJours" | "prestataireId" | "notes" | "actif">
>;

const date = (d: unknown, champ: string) => {
  const r = typeof d === "string" ? lireDate(d) : null;
  if (!r) throw new ErreurMetier(`${champ} : date invalide.`);
  return r;
};

/** Champs vérifiés et normalisés ; intervalle vide (ou incomplet) = entretien ponctuel. */
function nettoyer(v: Saisie) {
  const r: Saisie = {};
  if (v.titre !== undefined) {
    r.titre = (v.titre ?? "").trim();
    if (!r.titre) throw new ErreurMetier("Le titre est obligatoire.");
  }
  if (v.nature !== undefined) {
    if (!estNature(v.nature)) throw new ErreurMetier("Nature inconnue : tâche ou rendez-vous.");
    r.nature = v.nature;
  }
  if (v.intervalleValeur !== undefined || v.intervalleUnite !== undefined) {
    const valeur = v.intervalleValeur;
    const recurrent = valeur != null && estUnite(v.intervalleUnite);
    if (recurrent && (!Number.isInteger(valeur) || valeur < 1 || valeur > 1000)) throw new ErreurMetier("Intervalle invalide.");
    r.intervalleValeur = recurrent ? valeur : null;
    r.intervalleUnite = recurrent ? v.intervalleUnite : null;
  }
  if (v.ancrage !== undefined) r.ancrage = v.ancrage === "fixe" ? "fixe" : "realisation";
  if (v.echeance !== undefined) r.echeance = date(v.echeance, "Échéance");
  if (v.delaiAlerteJours !== undefined) {
    if (!Number.isInteger(v.delaiAlerteJours) || v.delaiAlerteJours < 0 || v.delaiAlerteJours > 3650) throw new ErreurMetier("Délai d'alerte invalide.");
    r.delaiAlerteJours = v.delaiAlerteJours;
  }
  if (v.prestataireId !== undefined) r.prestataireId = v.prestataireId || null;
  if (v.notes !== undefined) r.notes = v.notes?.trim() || null;
  if (v.actif !== undefined) r.actif = !!v.actif;
  return r;
}

/** Bibliothèque d'entretiens types, par catégorie. */
export const listeModeles = () => db.select().from(modeleEntretien).orderBy(asc(modeleEntretien.categorie), asc(modeleEntretien.titre));

/**
 * Nouvel entretien. Première échéance : celle donnée, sinon la « dernière réalisation » + intervalle
 * (la réalisation est alors consignée dans l'historique), sinon aujourd'hui.
 */
export async function creerEntretien(v: Saisie & { elementId: string; titre: string; derniereRealisation?: string | null }) {
  const valeurs = nettoyer({ nature: "tache", ...v });
  const nature = valeurs.nature as "tache" | "rdv";
  const derniere = v.derniereRealisation ? date(v.derniereRealisation, "Dernière réalisation") : null;
  let echeance = valeurs.echeance;
  if (!echeance && derniere && estRecurrent(valeurs)) echeance = ajouter(derniere, valeurs.intervalleValeur!, valeurs.intervalleUnite as Unite);
  const id = newId();
  await db.insert(entretien).values({
    ...valeurs,
    id,
    elementId: v.elementId,
    titre: valeurs.titre!,
    nature,
    echeance: echeance ?? aujourdhui(),
    delaiAlerteJours: valeurs.delaiAlerteJours ?? DELAI_DEFAUT[nature],
    etat: "a_faire",
    actif: true,
  });
  if (derniere)
    await db.insert(realisation).values({ id: newId(), elementId: v.elementId, entretienId: id, date: derniere, titre: valeurs.titre!, prestataireId: valeurs.prestataireId ?? null });
  return id;
}

export async function majEntretien(id: string, patch: Saisie, version?: string | null) {
  await verifierVersion("entretien", id, version);
  await db.update(entretien).set(nettoyer(patch)).where(eq(entretien.id, id));
  return versionDe("entretien", id);
}

/** Les réalisations passées restent dans l'historique, sans entretien rattaché. */
export const supprimerEntretien = (id: string) => db.delete(entretien).where(eq(entretien.id, id));

/** Rendez-vous pris : on n'est plus relancé ; rappel la veille (date facultative si pas encore fixée). */
export async function prendreRdv(id: string, v: { dateRdv?: string | null; prestataireId?: string | null }) {
  await db
    .update(entretien)
    .set({ etat: "rdv_pris", dateRdv: v.dateRdv ? date(v.dateRdv, "Date du rendez-vous") : null, ...(v.prestataireId !== undefined ? { prestataireId: v.prestataireId || null } : {}) })
    .where(eq(entretien.id, id));
}

/** Rendez-vous annulé : l'entretien redevient à prendre. */
export const annulerRdv = (id: string) => db.update(entretien).set({ etat: "a_faire", dateRdv: null }).where(eq(entretien.id, id));

/**
 * L'entretien est fait : consigné dans l'historique, puis échéance suivante (récurrent)
 * ou clôture (ponctuel). Renvoie l'identifiant de la réalisation (pour y joindre des documents).
 */
export async function realiserEntretien(id: string, v: { date: string; note?: string | null; cout?: number | null; prestataireId?: string | null }) {
  const [e] = await db.select().from(entretien).where(eq(entretien.id, id));
  if (!e) throw new ErreurMetier("Entretien introuvable", 404);
  const jour = date(v.date, "Date");
  if (v.cout != null && (!Number.isFinite(v.cout) || v.cout < 0)) throw new ErreurMetier("Coût invalide.");
  const prestataireId = v.prestataireId === undefined ? e.prestataireId : v.prestataireId || null;
  const realisationId = newId();
  await db.insert(realisation).values({ id: realisationId, elementId: e.elementId, entretienId: id, date: jour, titre: e.titre, note: v.note?.trim() || null, cout: v.cout ?? null, prestataireId });
  const suivante = prochaineEcheance(e, jour);
  await db
    .update(entretien)
    .set({ etat: "a_faire", dateRdv: null, ...(suivante ? { echeance: suivante } : { actif: false }) })
    .where(eq(entretien.id, id));
  return realisationId;
}
