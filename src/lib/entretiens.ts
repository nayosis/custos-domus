/*
 * Règles des entretiens, partagées par le serveur (calcul des échéances) et l'interface (affichage).
 * Dates : chaînes « AAAA-MM-JJ ».
 */

export type Unite = "jour" | "semaine" | "mois" | "an";
export type Ancrage = "realisation" | "fixe";

/** Longueur maximale du message perso d'une notification envoyée à la demande. */
export const MESSAGE_MAX = 200;

/** Qui s'en charge : un seul choix. */
export type Qui = "nous" | "prestataire" | "enfants";
export const QUI: Record<Qui, string> = { nous: "Nous", prestataire: "Un prestataire", enfants: "Les enfants" };

/** Confiée aux enfants (des points), sinon à un prestataire s'il y en a un, sinon à nous. */
export const quiDe = (e: { points?: number | null; prestataireId?: string | null }): Qui =>
  e.points != null ? "enfants" : e.prestataireId ? "prestataire" : "nous";

export const UNITES: Record<Unite, { un: string; plusieurs: string }> = {
  jour: { un: "jour", plusieurs: "jours" },
  semaine: { un: "semaine", plusieurs: "semaines" },
  mois: { un: "mois", plusieurs: "mois" },
  an: { un: "an", plusieurs: "ans" },
};
export const estUnite = (x: unknown): x is Unite => typeof x === "string" && Object.hasOwn(UNITES, x);

/**
 * Délai d'alerte par défaut : un rendez-vous se prend tôt (6 semaines) ; ce qui revient chaque jour ou chaque
 * semaine se rappelle le jour même ; le reste, une semaine avant.
 */
export const delaiDefaut = (e: { avecRdv?: boolean | null; intervalleValeur?: number | null; intervalleUnite?: string | null }) =>
  e.avecRdv ? 42 : estFrequente(e) ? 0 : 7;

/** Où se trouve une chose à faire : « Pompe à chaleur, Maison principale », la maison seule, ou le véhicule seul. */
export const lieu = (e: { elementNom?: string | null; maisonNom: string | null }, separateur = ", ") =>
  [e.elementNom, e.maisonNom].filter(Boolean).join(separateur);

const enDate = (d: string) => {
  const [a, m, j] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
};
const enTexte = (d: Date) => d.toISOString().slice(0, 10);

/** Ajoute un intervalle ; en fin de mois, on reste dans le mois visé (31 janvier + 1 mois → 28 février). */
export function ajouter(date: string, valeur: number, unite: Unite) {
  const d = enDate(date);
  if (unite === "jour" || unite === "semaine") {
    d.setUTCDate(d.getUTCDate() + (unite === "semaine" ? valeur * 7 : valeur));
    return enTexte(d);
  }
  const mois = unite === "an" ? valeur * 12 : valeur;
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return enTexte(d);
}

/** Nombre de jours de `de` à `a` (négatif si `a` est avant). */
export const joursEntre = (de: string, a: string) => Math.round((enDate(a).getTime() - enDate(de).getTime()) / 86_400_000);

type Recurrence = { intervalleValeur: number | null; intervalleUnite: string | null; ancrage: string; echeance: string; echeanceInitiale?: string | null };

export const estRecurrent = (e: { intervalleValeur?: number | null; intervalleUnite?: string | null }) => !!e.intervalleValeur && estUnite(e.intervalleUnite);

/** Une routine revient (un intervalle) ; une tâche se fait une fois. */
export const estRoutine = estRecurrent;
export const genre = (e: { intervalleValeur?: number | null; intervalleUnite?: string | null }) => (estRoutine(e) ? "Routine" : "Tâche");

/** Revient chaque jour ou chaque semaine (poubelles, arrosage) : rappelée le jour même, absente de « plus tard ». */
export const estFrequente = (e: { intervalleValeur?: number | null; intervalleUnite?: string | null }) =>
  estRecurrent(e) && (e.intervalleUnite === "jour" || e.intervalleUnite === "semaine");

/**
 * « Fait » en un geste (date du jour, sans formulaire) : quand c'est nous ou les enfants, sans rendez-vous.
 * Prestataire ou rendez-vous : le formulaire (date, coût, facture).
 */
export const faitEnUnGeste = (e: { avecRdv: boolean; points?: number | null; prestataireId?: string | null }) => !e.avecRdv && quiDe(e) !== "prestataire";

/**
 * Échéance suivante quand l'entretien est fait le `date`, ou null s'il est ponctuel (il est alors clos).
 * - ancrage « realisation » : date réelle + intervalle ;
 * - ancrage « fixe » : échéance précédente + intervalle, répété tant qu'on ne dépasse pas la date de réalisation
 *   (un entretien très en retard ne laisse pas d'échéances déjà passées). Une échéance reportée compte
 *   pour sa date d'origine : le rythme ne glisse pas.
 */
export function prochaineEcheance(e: Recurrence, date: string): string | null {
  if (!estRecurrent(e)) return null;
  const [v, u] = [e.intervalleValeur!, e.intervalleUnite as Unite];
  if (e.ancrage !== "fixe") return ajouter(date, v, u);
  let suivante = ajouter(e.echeanceInitiale ?? e.echeance, v, u);
  while (suivante <= date) suivante = ajouter(suivante, v, u);
  return suivante;
}

/**
 * Les fois prévues jusqu'au `fin` inclus (vue chronologique) : la fois actuelle (au rendez-vous s'il est pris),
 * puis, pour une routine, les suivantes, en supposant chacune faite à sa date (aujourd'hui pour une fois en
 * retard). `suivante` : une fois seulement prévue, pas encore d'actualité.
 */
export function occurrences(
  e: Recurrence & { etat: string; dateRdv: string | null },
  aujourdhui: string,
  fin: string,
  max = 100,
): { date: string; suivante: boolean }[] {
  const r = [{ date: e.etat === "rdv_pris" && e.dateRdv ? e.dateRdv : e.echeance, suivante: false }];
  let cur = e.echeance;
  let initiale = e.echeanceInitiale ?? null;
  while (r.length < max) {
    const suivante = prochaineEcheance({ ...e, echeance: cur, echeanceInitiale: initiale }, cur < aujourdhui ? aujourdhui : cur);
    if (!suivante || suivante > fin) break;
    r.push({ date: suivante, suivante: true });
    cur = suivante;
    initiale = null;
  }
  return r;
}

/**
 * Échéance suivante quand l'occurrence est passée (sautée) : toujours à partir de l'échéance d'origine,
 * en sautant celles déjà dépassées (la suivante peut tomber aujourd'hui). Null si l'entretien est ponctuel.
 */
export function echeanceApresPassage(e: Recurrence, aujourdhui: string): string | null {
  const base = e.echeanceInitiale ?? e.echeance;
  const veille = ajouter(aujourdhui, -1, "jour");
  return prochaineEcheance({ ...e, ancrage: "fixe", echeanceInitiale: base }, veille > base ? veille : base);
}

/** « tous les 4 ans », « chaque année », « toutes les 2 semaines » ; « une fois » pour un entretien ponctuel. */
export function libelleIntervalle(e: Pick<Recurrence, "intervalleValeur" | "intervalleUnite">) {
  if (!estRecurrent(e)) return "une fois";
  const v = e.intervalleValeur!;
  const u = e.intervalleUnite as Unite;
  if (v === 1) return { an: "chaque année", mois: "chaque mois", semaine: "chaque semaine", jour: "chaque jour" }[u];
  return `${u === "semaine" ? "toutes" : "tous"} les ${v} ${UNITES[u].plusieurs}`;
}

/** Heure saisie « 14:00 », « 14h », « 9h30 » → « 14:00 », « 09:30 » ; null si invalide. */
export function lireHeure(saisie: string): string | null {
  const m = /^(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?$/.exec(saisie.trim());
  if (!m) return null;
  const [h, mn] = [Number(m[1]), Number(m[2] ?? 0)];
  if (h > 23 || mn > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

/** « 14 h », « 14 h 30 – 16 h » (durée en minutes facultative). */
export function libelleHeure(heure: string | null | undefined, dureeMinutes?: number | null) {
  if (!heure) return "";
  const f = (minutes: number) => {
    const [h, m] = [Math.floor(minutes / 60) % 24, minutes % 60];
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  };
  const [h, m] = heure.split(":").map(Number);
  const debut = h * 60 + m;
  return dureeMinutes ? `${f(debut)} – ${f(debut + dureeMinutes)}` : f(debut);
}

/** Durées proposées pour un rendez-vous (minutes). */
export const DUREES_RDV = [30, 60, 90, 120, 180, 240, 480];
export const libelleDuree = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60}` : `${minutes / 60} h`);

/** « 6 semaines », « 1 semaine », « 10 jours ». */
export function libelleDelai(jours: number) {
  if (jours >= 7 && jours % 7 === 0) return `${jours / 7} semaine${jours > 7 ? "s" : ""}`;
  return `${jours} jour${jours > 1 ? "s" : ""}`;
}

export type Situation =
  | { etat: "inactif" }
  | { etat: "rdv_pris"; dateRdv: string | null; jours: number | null }
  | { etat: "en_retard"; jours: number }
  | { etat: "a_prevoir"; jours: number }
  | { etat: "a_venir"; jours: number };

/**
 * Où en est un entretien aujourd'hui :
 * - rendez-vous pris (avec sa date) ;
 * - en retard (échéance passée) ;
 * - à prévoir : la fenêtre d'alerte est ouverte (échéance − délai) ;
 * - à venir.
 */
export function situation(
  e: { actif: boolean; etat: string; dateRdv: string | null; echeance: string; delaiAlerteJours: number },
  aujourdhui: string,
): Situation {
  if (!e.actif) return { etat: "inactif" };
  if (e.etat === "rdv_pris") return { etat: "rdv_pris", dateRdv: e.dateRdv, jours: e.dateRdv ? joursEntre(aujourdhui, e.dateRdv) : null };
  const jours = joursEntre(aujourdhui, e.echeance);
  if (jours < 0) return { etat: "en_retard", jours: -jours };
  if (jours <= e.delaiAlerteJours) return { etat: "a_prevoir", jours };
  return { etat: "a_venir", jours };
}
