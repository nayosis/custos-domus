/** Dates « AAAA-MM-JJ » affichées à la française : « 14 mars 2026 ». */
export function dateLisible(d: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  if (!d) return "";
  const [a, m, j] = d.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-FR", options);
}

/** Date du jour au format « AAAA-MM-JJ » (heure locale). */
export function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Montant en euros : « 1 250 € ». */
export const euros = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 });

/**
 * Date saisie au clavier : « 14/03/2025 », « 14-3-25 », « 14.03.2025 » ou « 2025-03-14 » → « 2025-03-14 ».
 * Null si la saisie n'est pas une date valide.
 */
export function lireDate(saisie: string): string | null {
  const s = saisie.trim();
  let a: number, m: number, j: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const fr = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/.exec(s);
  if (iso) [a, m, j] = [+iso[1], +iso[2], +iso[3]];
  else if (fr) [j, m, a] = [+fr[1], +fr[2], fr[3].length === 2 ? 2000 + +fr[3] : +fr[3]];
  else return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null;
  return d.toISOString().slice(0, 10);
}

/** Durée arrondie à l'unité parlante : « 12 jours », « 5 mois », « 3 ans ». */
export function duree(jours: number) {
  const j = Math.abs(jours);
  if (j < 60) return `${j} jour${j > 1 ? "s" : ""}`;
  if (j < 730) return `${Math.round(j / 30.44)} mois`;
  return `${Math.round(j / 365.25)} ans`;
}
