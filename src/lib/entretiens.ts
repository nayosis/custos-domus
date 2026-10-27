/*
 * Règles des entretiens, partagées par le serveur (calcul des échéances) et l'interface (affichage).
 * Dates : chaînes « AAAA-MM-JJ ».
 */

export type Nature = "tache" | "rdv";
export type Unite = "jour" | "mois" | "an";
export type Ancrage = "realisation" | "fixe";

export const NATURES: Record<Nature, string> = { tache: "Tâche", rdv: "Rendez-vous" };
export const UNITES: Record<Unite, { un: string; plusieurs: string }> = {
  jour: { un: "jour", plusieurs: "jours" },
  mois: { un: "mois", plusieurs: "mois" },
  an: { un: "an", plusieurs: "ans" },
};
export const estNature = (x: unknown): x is Nature => x === "tache" || x === "rdv";
export const estUnite = (x: unknown): x is Unite => x === "jour" || x === "mois" || x === "an";

/** Délai d'alerte par défaut : un rendez-vous se prend tôt (6 semaines), une tâche se fait vite (1 semaine). */
export const DELAI_DEFAUT: Record<Nature, number> = { rdv: 42, tache: 7 };

const enDate = (d: string) => {
  const [a, m, j] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j));
};
const enTexte = (d: Date) => d.toISOString().slice(0, 10);

/** Ajoute un intervalle ; en fin de mois, on reste dans le mois visé (31 janvier + 1 mois → 28 février). */
export function ajouter(date: string, valeur: number, unite: Unite) {
  const d = enDate(date);
  if (unite === "jour") {
    d.setUTCDate(d.getUTCDate() + valeur);
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

type Recurrence = { intervalleValeur: number | null; intervalleUnite: string | null; ancrage: string; echeance: string };

export const estRecurrent = (e: { intervalleValeur?: number | null; intervalleUnite?: string | null }) => !!e.intervalleValeur && estUnite(e.intervalleUnite);

/**
 * Échéance suivante quand l'entretien est fait le `date`, ou null s'il est ponctuel (il est alors clos).
 * - ancrage « realisation » : date réelle + intervalle ;
 * - ancrage « fixe » : échéance précédente + intervalle, répété tant qu'on ne dépasse pas la date de réalisation
 *   (un entretien très en retard ne laisse pas d'échéances déjà passées).
 */
export function prochaineEcheance(e: Recurrence, date: string): string | null {
  if (!estRecurrent(e)) return null;
  const [v, u] = [e.intervalleValeur!, e.intervalleUnite as Unite];
  if (e.ancrage !== "fixe") return ajouter(date, v, u);
  let suivante = ajouter(e.echeance, v, u);
  while (suivante <= date) suivante = ajouter(suivante, v, u);
  return suivante;
}

/** « tous les 4 ans », « chaque année », « tous les 6 mois » ; « une fois » pour un entretien ponctuel. */
export function libelleIntervalle(e: Pick<Recurrence, "intervalleValeur" | "intervalleUnite">) {
  if (!estRecurrent(e)) return "une fois";
  const v = e.intervalleValeur!;
  const u = e.intervalleUnite as Unite;
  if (v === 1) return u === "an" ? "chaque année" : u === "mois" ? "chaque mois" : "chaque jour";
  return `tous les ${v} ${UNITES[u].plusieurs}`;
}

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
