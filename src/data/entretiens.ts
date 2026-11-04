import { asc, eq } from "drizzle-orm";
import { db, newId } from "../db/client";
import { entretien, modeleEntretien, realisation, type Entretien } from "../db/schema";
import { aujourdhui, lireDate } from "../lib/dates";
import { ajouter, DELAI_DEFAUT, echeanceApresPassage, estNature, estRecurrent, estUnite, lireHeure, prochaineEcheance, type Unite } from "../lib/entretiens";
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
  const valeurs = nettoyer(patch);
  // Échéance changée à la main : c'est la nouvelle référence du rythme, un report en cours est oublié.
  const [avant] = valeurs.echeance ? await db.select({ echeance: entretien.echeance }).from(entretien).where(eq(entretien.id, id)) : [];
  await db
    .update(entretien)
    .set({ ...valeurs, ...(avant && avant.echeance !== valeurs.echeance ? { echeanceInitiale: null } : {}) })
    .where(eq(entretien.id, id));
  return versionDe("entretien", id);
}

/** Les réalisations passées restent dans l'historique, sans entretien rattaché. */
export const supprimerEntretien = (id: string) => db.delete(entretien).where(eq(entretien.id, id));

/** Plus de rendez-vous en cours (annulé, fait ou passé). */
const SANS_RDV = { etat: "a_faire", dateRdv: null, heureRdv: null, dureeRdvMinutes: null } as const;

/**
 * Rendez-vous pris : on n'est plus relancé ; rappel la veille (date facultative si pas encore fixée).
 * Heure facultative (sans elle : journée entière dans l'agenda) ; durée en minutes, 1 h par défaut avec une heure.
 */
export async function prendreRdv(
  id: string,
  v: { dateRdv?: string | null; heureRdv?: string | null; dureeRdvMinutes?: number | null; prestataireId?: string | null },
) {
  const dateRdv = v.dateRdv ? date(v.dateRdv, "Date du rendez-vous") : null;
  const heureRdv = v.heureRdv ? lireHeure(v.heureRdv) : null;
  if (v.heureRdv && !heureRdv) throw new ErreurMetier("Heure invalide (14:00, 9h30…).");
  if (heureRdv && !dateRdv) throw new ErreurMetier("Une heure sans date : indiquez aussi la date du rendez-vous.");
  const duree = v.dureeRdvMinutes ?? null;
  if (duree != null && (!Number.isInteger(duree) || duree < 5 || duree > 24 * 60)) throw new ErreurMetier("Durée invalide.");
  await db
    .update(entretien)
    .set({
      etat: "rdv_pris",
      dateRdv,
      heureRdv,
      dureeRdvMinutes: heureRdv ? (duree ?? 60) : null,
      ...(v.prestataireId !== undefined ? { prestataireId: v.prestataireId || null } : {}),
    })
    .where(eq(entretien.id, id));
}

/** Rendez-vous annulé : l'entretien redevient à prendre. */
export const annulerRdv = (id: string) => db.update(entretien).set(SANS_RDV).where(eq(entretien.id, id));

const charger = async (id: string) => {
  const [e] = await db.select().from(entretien).where(eq(entretien.id, id));
  if (!e) throw new ErreurMetier("Entretien introuvable", 404);
  return e;
};

/**
 * Cette fois, on ne le fait pas (haie peu poussée, absent…) : consigné dans l'historique comme « passé »
 * (sans coût, hors statistiques), puis échéance suivante calculée depuis l'échéance passée — ou clôture s'il est ponctuel.
 */
export async function passerEcheance(id: string, v: { motif?: string | null } = {}) {
  const e = await charger(id);
  const occurrence = e.echeanceInitiale ?? e.echeance;
  await db.insert(realisation).values({ id: newId(), elementId: e.elementId, entretienId: id, date: occurrence, titre: e.titre, note: v.motif?.trim() || null, passee: true });
  const suivante = echeanceApresPassage(e, aujourdhui());
  await db
    .update(entretien)
    .set({ ...SANS_RDV, echeanceInitiale: null, ...(suivante ? { echeance: suivante } : { actif: false }) })
    .where(eq(entretien.id, id));
  return suivante;
}

/** Repousse cette échéance seulement : le rythme (ancrage fixe) repart de la date d'origine. */
export async function reporterEcheance(id: string, v: { date: string }) {
  const e = await charger(id);
  const nouvelle = date(v.date, "Nouvelle date");
  const origine = e.echeanceInitiale ?? e.echeance;
  await db
    .update(entretien)
    .set({ echeance: nouvelle, echeanceInitiale: nouvelle === origine ? null : origine })
    .where(eq(entretien.id, id));
}

/**
 * L'entretien est fait : consigné dans l'historique, puis échéance suivante (récurrent)
 * ou clôture (ponctuel). Renvoie l'identifiant de la réalisation (pour y joindre des documents).
 */
export async function realiserEntretien(id: string, v: { date: string; note?: string | null; cout?: number | null; prestataireId?: string | null }) {
  const e = await charger(id);
  const jour = date(v.date, "Date");
  if (v.cout != null && (!Number.isFinite(v.cout) || v.cout < 0)) throw new ErreurMetier("Coût invalide.");
  const prestataireId = v.prestataireId === undefined ? e.prestataireId : v.prestataireId || null;
  const realisationId = newId();
  await db.insert(realisation).values({ id: realisationId, elementId: e.elementId, entretienId: id, date: jour, titre: e.titre, note: v.note?.trim() || null, cout: v.cout ?? null, prestataireId });
  const suivante = prochaineEcheance(e, jour);
  await db
    .update(entretien)
    .set({ ...SANS_RDV, echeanceInitiale: null, ...(suivante ? { echeance: suivante } : { actif: false }) })
    .where(eq(entretien.id, id));
  return realisationId;
}
