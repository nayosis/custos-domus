/** Famille : règles partagées par le serveur et le navigateur (semaines, codes PIN, points). */
import { ajouter } from "./entretiens";

export const POINTS_DEFAUT = 10;
export const OBJECTIF_DEFAUT = 50;
/** Une mission validée sans réponse d'un parent l'est d'office au bout de 48 h. */
export const VALIDATION_AUTO_HEURES = 48;
/** Une mission se coche au plus deux jours avant son échéance (et une fois par jour). */
export const AVANCE_MAX_JOURS = 2;
/** Après 10 codes faux de suite, le profil est bloqué jusqu'à ce qu'un parent donne un nouveau code. */
export const ECHECS_PIN_MAX = 10;

/** Code PIN : 4 à 8 chiffres. */
export const pinValide = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4,8}$/.test(pin);

/** Lundi de la semaine du jour donné (« AAAA-MM-JJ »). */
export function debutSemaine(jour: string) {
  const d = new Date(`${jour}T12:00:00Z`).getUTCDay();
  return ajouter(jour, -((d + 6) % 7), "jour");
}
export const finSemaine = (jour: string) => ajouter(debutSemaine(jour), 6, "jour");

/** Peut-on cocher cette mission aujourd'hui ? Assez proche de son échéance, et pas déjà faite aujourd'hui. */
export const faisable = (echeance: string, jour: string, faiteAujourdhui: boolean) => !faiteAujourdhui && echeance <= ajouter(jour, AVANCE_MAX_JOURS, "jour");

export const points = (n: number) => `${n} point${n > 1 ? "s" : ""}`;

export type Validation = "a_valider" | "validee" | "refusee";
export const LIBELLES_VALIDATION: Record<Validation, string> = { a_valider: "À valider", validee: "Validée", refusee: "Refusée" };
export type StatutEchange = "demandee" | "accordee" | "refusee";
export const LIBELLES_ECHANGE: Record<StatutEchange, string> = { demandee: "Demandée", accordee: "Accordée", refusee: "Refusée" };
