/*
 * Flux d'agenda (iCalendar, lecture seule) : on s'y abonne depuis Google Agenda, Apple Calendrier, Thunderbird…
 * Événements sur la journée entière (échéances, moment de prendre rendez-vous, fins de garantie), sauf les
 * rendez-vous pris avec une heure : un vrai créneau, avec une alarme une heure avant.
 * Le même contenu sert aux liens personnels et au lien de la famille (agenda partagé).
 */
import { dateLisible } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
import { FUSEAU } from "./config";
import { chargerSuivi } from "./rappels";

/** Échappement des textes (RFC 5545 §3.3.11). */
const texte = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lignes de 75 octets au plus, les suivantes commencent par une espace (RFC 5545 §3.1). */
function plier(ligne: string) {
  const octets = new TextEncoder().encode(ligne);
  if (octets.length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = "";
  for (const car of ligne) {
    const limite = morceaux.length ? 74 : 75;
    if (new TextEncoder().encode(courant + car).length > limite) {
      morceaux.push(courant);
      courant = "";
    }
    courant += car;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}

const alarme = (resume: string, declencheur: string) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${texte(resume)}`, `TRIGGER:${declencheur}`, "END:VALARM"];
const jourIcal = (d: string) => d.replace(/-/g, "");
const instantIcal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

/** Écart (ms) entre l'heure locale du fuseau et l'heure UTC, à cet instant. */
function decalage(d: Date, fuseau: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** « 2026-11-20 » à « 14:00 », heure du fuseau de l'installation → instant UTC (changements d'heure compris). */
export function instantLocal(jour: string, heure: string, fuseau = FUSEAU) {
  const [a, m, j] = jour.split("-").map(Number);
  const [h, mn] = heure.split(":").map(Number);
  const naif = Date.UTC(a, m - 1, j, h, mn);
  let t = naif - decalage(new Date(naif), fuseau);
  t = naif - decalage(new Date(t), fuseau);
  return new Date(t);
}

type Evenement = { uid: string; jour: string; resume: string; description?: string; rappelVeille?: boolean; creneau?: { debut: Date; fin: Date } };

export async function genererIcal(maintenant = new Date(), { famille = false } = {}) {
  const { entretiens, garanties } = await chargerSuivi();
  const evenements: Evenement[] = [];
  for (const e of entretiens) {
    const ou = e.elementNom ? `${e.elementNom} (${e.maisonNom})` : e.maisonNom;
    const quoi = (debut: string) => `${debut} : ${e.titre}${e.elementNom ? ` – ${e.elementNom}` : ""}`;
    const contact = e.prestataireNom ? `\nPrestataire : ${e.prestataireNom}${e.prestataireTelephone ? `, ${e.prestataireTelephone}` : ""}` : "";
    if (e.etat === "rdv_pris" && e.dateRdv) {
      const debut = e.heureRdv ? instantLocal(e.dateRdv, e.heureRdv) : null;
      evenements.push({
        uid: `rdv-${e.id}`,
        jour: e.dateRdv,
        resume: quoi("RDV"),
        description: `${ou}${contact}`,
        ...(debut ? { creneau: { debut, fin: new Date(debut.getTime() + (e.dureeRdvMinutes ?? 60) * 60_000) } } : { rappelVeille: true }),
      });
      continue;
    }
    if (e.nature === "rdv" && e.etat !== "rdv_pris" && e.delaiAlerteJours > 0)
      evenements.push({
        uid: `prendre-${e.id}`,
        jour: ajouter(e.echeance, -e.delaiAlerteJours, "jour"),
        resume: quoi("Prendre RDV"),
        description: `${ou}, échéance le ${dateLisible(e.echeance)}${contact}`,
      });
    evenements.push({
      uid: `echeance-${e.id}`,
      jour: e.echeance,
      resume: quoi(e.nature === "rdv" ? "Échéance" : "À faire"),
      description: `${ou}${e.notes ? `\n${e.notes}` : ""}${contact}`,
    });
  }
  // Garanties : celles qui courent encore, et celles expirées depuis moins d'un an.
  const ilYAUnAn = ajouter(maintenant.toISOString().slice(0, 10), -1, "an");
  for (const g of garanties.filter((x) => x.finGarantie >= ilYAUnAn))
    evenements.push({ uid: `garantie-${g.id}`, jour: g.finGarantie, resume: `Fin de garantie : ${g.nom}`, description: g.maisonNom });

  const horodatage = instantIcal(maintenant);
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Custos Domus//Rappels//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${famille ? "Custos Domus – famille" : "Custos Domus"}`,
    "X-WR-CALDESC:Entretiens\\, rendez-vous et garanties de vos maisons",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const ev of evenements) {
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}@custos-domus`,
      `DTSTAMP:${horodatage}`,
      ...(ev.creneau
        ? [`DTSTART:${instantIcal(ev.creneau.debut)}`, `DTEND:${instantIcal(ev.creneau.fin)}`]
        : [`DTSTART;VALUE=DATE:${jourIcal(ev.jour)}`, `DTEND;VALUE=DATE:${jourIcal(ajouter(ev.jour, 1, "jour"))}`]),
      `SUMMARY:${texte(ev.resume)}`,
      ...(ev.description ? [`DESCRIPTION:${texte(ev.description)}`] : []),
      // Un créneau occupe l'agenda ; une journée entière reste « disponible ».
      ev.creneau ? "TRANSP:OPAQUE" : "TRANSP:TRANSPARENT",
      // Rendez-vous : alarme une heure avant le créneau ; sans heure, la veille à 18 h (6 h avant le début de la journée).
      ...(ev.creneau ? alarme(ev.resume, "-PT1H") : ev.rappelVeille ? alarme(ev.resume, "-PT6H") : []),
      "END:VEVENT",
    );
  }
  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join("\r\n") + "\r\n";
}
