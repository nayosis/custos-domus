/*
 * Flux d'agenda (iCalendar, lecture seule) : on s'y abonne depuis Google Agenda, Apple Calendrier, Thunderbird…
 * Événements sur la journée entière : échéances, moment de prendre rendez-vous, rendez-vous pris, fins de garantie.
 */
import { dateLisible } from "../src/lib/dates";
import { ajouter } from "../src/lib/entretiens";
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

const jourIcal = (d: string) => d.replace(/-/g, "");

type Evenement = { uid: string; jour: string; resume: string; description?: string; rappelVeille?: boolean };

export async function genererIcal(maintenant = new Date()) {
  const { entretiens, garanties } = await chargerSuivi();
  const evenements: Evenement[] = [];
  for (const e of entretiens) {
    const ou = `${e.elementNom} (${e.maisonNom})`;
    const contact = e.prestataireNom ? `\nPrestataire : ${e.prestataireNom}${e.prestataireTelephone ? `, ${e.prestataireTelephone}` : ""}` : "";
    if (e.etat === "rdv_pris" && e.dateRdv) {
      evenements.push({ uid: `rdv-${e.id}`, jour: e.dateRdv, resume: `RDV : ${e.titre} – ${e.elementNom}`, description: `${ou}${contact}`, rappelVeille: true });
      continue;
    }
    if (e.nature === "rdv" && e.etat !== "rdv_pris" && e.delaiAlerteJours > 0)
      evenements.push({
        uid: `prendre-${e.id}`,
        jour: ajouter(e.echeance, -e.delaiAlerteJours, "jour"),
        resume: `Prendre RDV : ${e.titre} – ${e.elementNom}`,
        description: `${ou}, échéance le ${dateLisible(e.echeance)}${contact}`,
      });
    evenements.push({
      uid: `echeance-${e.id}`,
      jour: e.echeance,
      resume: `${e.nature === "rdv" ? "Échéance" : "À faire"} : ${e.titre} – ${e.elementNom}`,
      description: `${ou}${e.notes ? `\n${e.notes}` : ""}${contact}`,
    });
  }
  // Garanties : celles qui courent encore, et celles expirées depuis moins d'un an.
  const ilYAUnAn = ajouter(maintenant.toISOString().slice(0, 10), -1, "an");
  for (const g of garanties.filter((x) => x.finGarantie >= ilYAUnAn))
    evenements.push({ uid: `garantie-${g.id}`, jour: g.finGarantie, resume: `Fin de garantie : ${g.nom}`, description: g.maisonNom });

  const horodatage = maintenant.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Custos Domus//Rappels//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Custos Domus",
    "X-WR-CALDESC:Entretiens\\, rendez-vous et garanties de vos maisons",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const ev of evenements) {
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}@custos-domus`,
      `DTSTAMP:${horodatage}`,
      `DTSTART;VALUE=DATE:${jourIcal(ev.jour)}`,
      `DTEND;VALUE=DATE:${jourIcal(ajouter(ev.jour, 1, "jour"))}`,
      `SUMMARY:${texte(ev.resume)}`,
      ...(ev.description ? [`DESCRIPTION:${texte(ev.description)}`] : []),
      "TRANSP:TRANSPARENT",
      // Rendez-vous : alarme la veille à 18 h (6 h avant le début de la journée).
      ...(ev.rappelVeille ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${texte(ev.resume)}`, "TRIGGER:-PT6H", "END:VALARM"] : []),
      "END:VEVENT",
    );
  }
  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join("\r\n") + "\r\n";
}
