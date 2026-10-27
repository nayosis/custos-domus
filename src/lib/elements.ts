/** Catégories proposées (le champ reste libre : on peut en saisir une autre). */
export const CATEGORIES = [
  "Chauffage et climatisation",
  "Eau et assainissement",
  "Électricité",
  "Électroménager",
  "Informatique et multimédia",
  "Extérieur et jardin",
  "Toiture et façade",
  "Menuiseries",
  "Sécurité",
  "Véhicule",
  "Autre",
];

/** Durées de garantie courantes, en années (garantie légale : 2 ans). */
export const DUREES_GARANTIE = [1, 2, 3, 5, 10];

export type EtatGarantie = { etat: "aucune" } | { etat: "valide" | "bientot" | "expiree"; fin: string; jours: number };

/** Sous garantie, expire dans moins d'un mois, ou expirée (à la date du jour). */
export function etatGarantie(finGarantie: string | null | undefined, aujourdhui = new Date()): EtatGarantie {
  if (!finGarantie) return { etat: "aucune" };
  const jour = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const [a, m, j] = finGarantie.split("-").map(Number);
  const jours = Math.round((Date.UTC(a, m - 1, j) - jour) / 86_400_000);
  return { etat: jours < 0 ? "expiree" : jours <= 31 ? "bientot" : "valide", fin: finGarantie, jours };
}

/** Ajoute des années à une date « AAAA-MM-JJ » (29 février → 28 février). */
export function plusAnnees(date: string, annees: number) {
  const [a, m, j] = date.split("-").map(Number);
  const d = new Date(Date.UTC(a + annees, m - 1, j));
  if (d.getUTCMonth() !== m - 1) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
