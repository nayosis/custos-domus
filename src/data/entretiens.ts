import { and, asc, eq, inArray } from "drizzle-orm";
import { db, newId } from "../db/client";
import { element, enfant, entretien, modeleEntretien, realisation, type Entretien } from "../db/schema";
import { aujourdhui, dateLisible, lireDate } from "../lib/dates";
import { ajouter, delaiDefaut, MESSAGE_MAX, echeanceApresPassage, estRecurrent, estUnite, lireHeure, prochaineEcheance, type Unite } from "../lib/entretiens";
import { ErreurMetier } from "../../serveur/erreurs";
import { ajouterReleve, dernierKm, recalculerKm } from "../../serveur/kilometrage";
import { verifierVersion, versionDe } from "./version";
import { definirMission, type SaisieMission } from "../../serveur/missions";
import { envoyerPush, type Notification } from "../../serveur/envoi";
import { abonnementsDe, abonnementsEnfant, destinataires } from "../../serveur/reglages";
import { utilisateurCourant } from "../../serveur/tracabilite";

type Saisie = Partial<
  Pick<
    Entretien,
    "titre" | "avecRdv" | "intervalleValeur" | "intervalleUnite" | "ancrage" | "echeance" | "delaiAlerteJours" | "prestataireId" | "notes" | "actif" | "intervalleKm" | "kmEcheance"
  >
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
  if (v.avecRdv !== undefined) r.avecRdv = !!v.avecRdv;
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
  for (const k of ["intervalleKm", "kmEcheance"] as const)
    if (v[k] !== undefined) {
      const n = v[k];
      if (n != null && (!Number.isInteger(n) || n < 0 || n > 5_000_000 || (k === "intervalleKm" && n < 100))) throw new ErreurMetier("Kilométrage invalide.");
      r[k] = n ?? null;
    }
  if (v.actif !== undefined) r.actif = !!v.actif;
  return r;
}

const UN_SEUL_QUI = "Un prestataire ou les enfants : l'un ou l'autre.";

/** Bibliothèque d'entretiens types, par catégorie. */
export const listeModeles = () => db.select().from(modeleEntretien).orderBy(asc(modeleEntretien.categorie), asc(modeleEntretien.titre));

/** Rattachement : un élément, ou la maison directement — l'un ou l'autre. */
export type Rattachement = { elementId: string; maisonId?: null } | { maisonId: string; elementId?: null };
export function rattachement(v: { elementId?: string | null; maisonId?: string | null }) {
  if (!!v.elementId === !!v.maisonId) throw new ErreurMetier("À rattacher à un élément ou à une maison.");
  return { elementId: v.elementId || null, maisonId: v.maisonId || null };
}

/**
 * Nouvelle chose à faire. Première échéance : celle donnée, sinon la « dernière réalisation » + intervalle
 * (la réalisation est alors consignée dans l'historique), sinon aujourd'hui.
 * Qui s'en charge : un seul choix ; confiée aux enfants, elle n'a pas de prestataire.
 */
const estVehicule = async (elementId: string | null) =>
  !!elementId && (await db.select({ type: element.type }).from(element).where(eq(element.id, elementId)))[0]?.type === "vehicule";

export async function creerEntretien(
  v: Saisie &
    Rattachement & {
      titre: string;
      derniereRealisation?: string | null;
      /** Véhicule : kilométrage la dernière fois. */ kmDerniere?: number | null;
      /** Confiée aux enfants (partagée s'ils sont plusieurs : le premier qui la fait). */ mission?: SaisieMission;
    },
) {
  const ou = rattachement(v);
  const valeurs = nettoyer(v);
  if (v.mission?.enfants.length && valeurs.prestataireId) throw new ErreurMetier(UN_SEUL_QUI);
  const auKm = !!valeurs.intervalleKm;
  if (auKm && !(await estVehicule(ou.elementId))) throw new ErreurMetier("Un intervalle en kilomètres ne vaut que pour un véhicule.");
  if (v.kmDerniere != null && (!Number.isInteger(v.kmDerniere) || v.kmDerniere < 0)) throw new ErreurMetier("Kilométrage invalide.");
  const derniere = v.derniereRealisation ? date(v.derniereRealisation, "Dernière réalisation") : null;
  let echeance = valeurs.echeance;
  if (!echeance && derniere && estRecurrent(valeurs)) echeance = ajouter(derniere, valeurs.intervalleValeur!, valeurs.intervalleUnite as Unite);
  const id = newId();
  const kmEcheance = auKm ? (valeurs.kmEcheance ?? (v.kmDerniere ?? (await dernierKm(ou.elementId!)) ?? 0) + valeurs.intervalleKm!) : null;
  await db.insert(entretien).values({
    ...valeurs,
    kmEcheance,
    // Au premier atteint : l'échéance au temps est gardée à part, l'échéance réelle est recalculée ci-dessous.
    echeanceTemps: auKm && (estRecurrent(valeurs) || valeurs.echeance) ? (echeance ?? aujourdhui()) : null,
    id,
    ...ou,
    titre: valeurs.titre!,
    avecRdv: valeurs.avecRdv ?? false,
    echeance: echeance ?? aujourdhui(),
    delaiAlerteJours: valeurs.delaiAlerteJours ?? delaiDefaut(valeurs),
    etat: "a_faire",
    actif: true,
  });
  if (derniere)
    await db
      .insert(realisation)
      .values({ id: newId(), ...ou, entretienId: id, date: derniere, titre: valeurs.titre!, prestataireId: valeurs.prestataireId ?? null, kilometrage: v.kmDerniere ?? null });
  if (derniere && v.kmDerniere != null) await ajouterReleve(ou.elementId!, derniere, v.kmDerniere);
  if (auKm) await recalculerKm(ou.elementId!);
  if (v.mission) await definirMission(id, v.mission);
  return id;
}

export async function majEntretien(id: string, patch: Saisie & { mission?: SaisieMission }, version?: string | null) {
  await verifierVersion("entretien", id, version);
  const valeurs = nettoyer(patch);
  if (patch.mission?.enfants.length && valeurs.prestataireId) throw new ErreurMetier(UN_SEUL_QUI);
  // Un prestataire choisi : ce n'est plus une mission des enfants.
  if (patch.mission !== undefined) await definirMission(id, patch.mission);
  else if (valeurs.prestataireId) await definirMission(id, null);
  // Échéance changée à la main : c'est la nouvelle référence du rythme, un report en cours est oublié.
  const [avant] = valeurs.echeance ? await db.select({ echeance: entretien.echeance }).from(entretien).where(eq(entretien.id, id)) : [];
  if (Object.keys(valeurs).length)
    await db
      .update(entretien)
      .set({ ...valeurs, ...(avant && avant.echeance !== valeurs.echeance ? { echeanceInitiale: null } : {}) })
      .where(eq(entretien.id, id));
  // Véhicule au kilométrage : l'échéance saisie est celle au temps ; l'échéance réelle est recalculée.
  const e = await charger(id);
  if (e.intervalleKm) {
    if (!(await estVehicule(e.elementId))) throw new ErreurMetier("Un intervalle en kilomètres ne vaut que pour un véhicule.");
    await db
      .update(entretien)
      .set({
        ...(valeurs.echeance ? { echeanceTemps: estRecurrent(e) || !e.echeanceTemps ? valeurs.echeance : e.echeanceTemps } : {}),
        ...(e.kmEcheance == null ? { kmEcheance: ((await dernierKm(e.elementId!)) ?? 0) + e.intervalleKm } : {}),
      })
      .where(eq(entretien.id, id));
    await recalculerKm(e.elementId!);
  } else if (e.kmEcheance != null || e.echeanceTemps != null) await db.update(entretien).set({ kmEcheance: null, echeanceTemps: null }).where(eq(entretien.id, id));
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
  if (v.prestataireId) await definirMission(id, null);
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
  await db
    .insert(realisation)
    .values({ id: newId(), elementId: e.elementId, maisonId: e.maisonId, entretienId: id, date: occurrence, titre: e.titre, note: v.motif?.trim() || null, passee: true });
  if (e.intervalleKm) {
    // Au kilométrage : la fois suivante, un intervalle plus loin, au compteur comme au calendrier.
    const temps = estRecurrent(e) ? echeanceApresPassage({ ...e, echeance: e.echeanceTemps ?? e.echeance }, aujourdhui()) : null;
    const kmEcheance = (e.kmEcheance ?? (await dernierKm(e.elementId!)) ?? 0) + e.intervalleKm;
    await db
      .update(entretien)
      .set({ ...SANS_RDV, echeanceInitiale: null, echeanceTemps: temps, kmEcheance, echeance: temps ?? e.echeance })
      .where(eq(entretien.id, id));
    await recalculerKm(e.elementId!);
    return (await charger(id)).echeance;
  }
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
 * C'est fait : consigné dans l'historique, puis échéance suivante (récurrent) ou clôture (ponctuel).
 * Date du jour par défaut (« Fait » en un geste : rien d'autre à saisir).
 * Renvoie l'identifiant de la réalisation (pour y joindre des documents).
 */
export async function realiserEntretien(
  id: string,
  v: { date?: string | null; note?: string | null; cout?: number | null; prestataireId?: string | null; /** Véhicule : compteur ce jour-là. */ km?: number | null } = {},
) {
  const e = await charger(id);
  const jour = v.date ? date(v.date, "Date") : aujourdhui();
  // Le kilométrage noté devient un relevé (vérifié : le compteur ne recule pas).
  if (v.km != null) {
    if (!e.elementId) throw new ErreurMetier("Kilométrage : seulement pour un véhicule.");
    await ajouterReleve(e.elementId, jour, v.km);
  }
  if (v.cout != null && (!Number.isFinite(v.cout) || v.cout < 0)) throw new ErreurMetier("Coût invalide.");
  const prestataireId = v.prestataireId === undefined ? e.prestataireId : v.prestataireId || null;
  const realisationId = newId();
  await db.insert(realisation).values({
    id: realisationId,
    elementId: e.elementId,
    maisonId: e.maisonId,
    entretienId: id,
    date: jour,
    titre: e.titre,
    note: v.note?.trim() || null,
    cout: v.cout ?? null,
    prestataireId,
    kilometrage: v.km ?? null,
  });
  if (e.intervalleKm) {
    const kmFait = v.km ?? (await dernierKm(e.elementId!)) ?? e.kmEcheance ?? 0;
    const temps = estRecurrent(e) ? prochaineEcheance({ ...e, echeance: e.echeanceTemps ?? e.echeance }, jour) : null;
    await db
      .update(entretien)
      .set({ ...SANS_RDV, echeanceInitiale: null, echeanceTemps: temps, kmEcheance: kmFait + e.intervalleKm, echeance: temps ?? e.echeance })
      .where(eq(entretien.id, id));
    await recalculerKm(e.elementId!);
    return realisationId;
  }
  const suivante = prochaineEcheance(e, jour);
  await db
    .update(entretien)
    .set({ ...SANS_RDV, echeanceInitiale: null, ...(suivante ? { echeance: suivante } : { actif: false }) })
    .where(eq(entretien.id, id));
  return realisationId;
}

// --- Notifier à la demande

/**
 * Qui peut être prévenu d'une chose à faire : les enfants actifs et les autres parents, avec le nombre d'appareils
 * où leurs notifications sont activées (un parent qui les a coupées dans ses préférences n'en a aucun).
 */
export async function destinatairesNotification() {
  const enfants = await db.select({ id: enfant.id, prenom: enfant.prenom }).from(enfant).where(eq(enfant.actif, true)).orderBy(asc(enfant.prenom));
  const moi = utilisateurCourant();
  return {
    enfants: enfants.map((e) => ({ ...e, appareils: abonnementsEnfant(e.id).length })),
    parents: destinataires()
      .filter((d) => d.adresse !== moi)
      .map((d) => ({ id: d.id, nom: d.adresse.split("@")[0], appareils: d.push ? abonnementsDe(d.id).length : 0 })),
  };
}

/**
 * Notification envoyée tout de suite (« Rappel : nettoyer la chambre »), avec un message perso facultatif, sur les
 * appareils des enfants et des parents choisis. Renvoie le nombre d'appareils joints et qui n'en a aucun.
 */
export async function notifierEntretien(id: string, v: { enfants?: string[]; parents?: string[]; message?: string | null }) {
  const e = await charger(id);
  const message = v.message?.trim() || null;
  if (message && message.length > MESSAGE_MAX) throw new ErreurMetier(`Message trop long (${MESSAGE_MAX} caractères au plus).`);
  const idsEnfants = [...new Set(v.enfants ?? [])];
  const idsParents = [...new Set(v.parents ?? [])];
  if (!idsEnfants.length && !idsParents.length) throw new ErreurMetier("Choisissez à qui envoyer la notification.");
  const enfants = idsEnfants.length
    ? await db.select({ id: enfant.id, prenom: enfant.prenom }).from(enfant).where(and(inArray(enfant.id, idsEnfants), eq(enfant.actif, true)))
    : [];
  if (enfants.length !== idsEnfants.length) throw new ErreurMetier("Enfant inconnu.");
  const parents = destinataires().filter((d) => idsParents.includes(d.id));
  if (parents.length !== idsParents.length) throw new ErreurMetier("Parent inconnu.");

  const n: Omit<Notification, "url"> = {
    titre: `Rappel : ${e.titre}`,
    corps: message ?? `Pour le ${dateLisible(e.echeance)}`,
    tag: `custos-rappel-${id}`,
  };
  let envoyees = 0;
  const sansAppareil: string[] = [];
  const envoyer = async (appareils: ReturnType<typeof abonnementsDe>, url: string, nom: string) => {
    if (!appareils.length) return void sansAppareil.push(nom);
    const r = await Promise.all(appareils.map((a) => envoyerPush(a, { ...n, url }).catch((err: unknown) => String(err))));
    envoyees += r.filter((x) => x === "ok").length;
  };
  for (const x of enfants) await envoyer(abonnementsEnfant(x.id), "/enfant", x.prenom);
  for (const p of parents) await envoyer(p.push ? abonnementsDe(p.id) : [], "/", p.adresse.split("@")[0]);
  return { envoyees, sansAppareil };
}
