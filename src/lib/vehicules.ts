/*
 * Règles des véhicules, partagées par le serveur et l'interface : rythme de roulage d'après les relevés du
 * compteur, date estimée d'un entretien au kilométrage, relevé mensuel.
 */
import { ajouter, joursEntre } from "./entretiens";

export type ReleveKm = { date: string; km: number };

/** On estime le rythme sur l'année écoulée, à partir de deux relevés espacés d'au moins deux semaines. */
const FENETRE_JOURS = 365;
const ECART_MIN_JOURS = 14;

/** Jour du mois où l'on demande de relever le compteur, et jour de la relance si rien n'a été saisi. */
export const JOUR_RELEVE = 1;
export const JOUR_RELANCE = 4;

/** Le relevé le plus récent (date, puis kilométrage le plus haut le même jour). */
export function dernierReleve(releves: ReleveKm[]): ReleveKm | null {
  return releves.reduce<ReleveKm | null>((d, r) => (!d || r.date > d.date || (r.date === d.date && r.km > d.km) ? r : d), null);
}

/** Kilomètres par jour sur l'année écoulée (avant le dernier relevé), ou null si on ne peut pas encore l'estimer. */
export function rythmeKm(releves: ReleveKm[]): number | null {
  const dernier = dernierReleve(releves);
  if (!dernier) return null;
  const debut = ajouter(dernier.date, -FENETRE_JOURS, "jour");
  const premier = releves.filter((r) => r.date >= debut).reduce<ReleveKm | null>((p, r) => (!p || r.date < p.date ? r : p), null);
  if (!premier) return null;
  const jours = joursEntre(premier.date, dernier.date);
  if (jours < ECART_MIN_JOURS || dernier.km <= premier.km) return null;
  return (dernier.km - premier.km) / jours;
}

/** « ~1 200 km par mois ». */
export const libelleRythme = (parJour: number) => `~${(Math.round((parJour * 30.44) / 50) * 50).toLocaleString("fr-FR")} km par mois`;

/** « 84 200 km ». */
export const km = (n: number | null | undefined) => (n == null ? "" : `${n.toLocaleString("fr-FR")} km`);

/**
 * Date à laquelle le compteur atteindra `kmVise` : celle du dernier relevé s'il est déjà dépassé, sinon une
 * estimation au rythme actuel (null si on ne peut pas l'estimer).
 */
export function dateAuKm(kmVise: number, releves: ReleveKm[]): string | null {
  const dernier = dernierReleve(releves);
  if (!dernier) return null;
  if (dernier.km >= kmVise) return dernier.date;
  const rythme = rythmeKm(releves);
  if (!rythme) return null;
  return ajouter(dernier.date, Math.ceil((kmVise - dernier.km) / rythme), "jour");
}

/** Échéance d'un entretien « au temps ou au kilométrage, au premier atteint » : la plus proche des deux connues. */
export function echeanceAuPremier(echeanceTemps: string | null, dateKm: string | null): string | null {
  if (echeanceTemps && dateKm) return echeanceTemps < dateKm ? echeanceTemps : dateKm;
  return echeanceTemps ?? dateKm;
}

/** « tous les 15 000 km », ou « chaque année ou tous les 15 000 km ». */
export const libelleKm = (intervalleKm: number) => `tous les ${intervalleKm.toLocaleString("fr-FR")} km`;
