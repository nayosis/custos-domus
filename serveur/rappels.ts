/*
 * Rappels : chaque jour à 8 h, les alertes du jour (fenêtre d'alerte qui s'ouvre, échéance dépassée,
 * rendez-vous le lendemain, garantie qui expire dans un mois) ; le lundi, en plus, le récapitulatif
 * de tout ce qui attend. Maisons et éléments archivés, entretiens suspendus : jamais d'alerte.
 */
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db/client";
import { element, entretien, maison, prestataire } from "../src/db/schema";
import { dateLisible, maintenantLocal } from "../src/lib/dates";
import { ajouter, joursEntre, situation } from "../src/lib/entretiens";
import { envoyerEmail, envoyerPush, type Message } from "./envoi";
import { abonnementsDe, configEnvoi, derniereTournee, destinataires, envoiEmailPossible, noterTournee } from "./reglages";

/** Heure de la tournée quotidienne (fuseau de l'installation). */
export const HEURE_RAPPELS = 8;

/** Entretiens actifs et garanties des éléments suivis (rappels, flux d'agenda). */
export async function chargerSuivi() {
  const suivis = and(eq(maison.archivee, false), eq(element.archive, false));
  const [entretiens, garanties] = await Promise.all([
    db
      .select({
        id: entretien.id,
        titre: entretien.titre,
        nature: entretien.nature,
        echeance: entretien.echeance,
        delaiAlerteJours: entretien.delaiAlerteJours,
        etat: entretien.etat,
        dateRdv: entretien.dateRdv,
        actif: entretien.actif,
        notes: entretien.notes,
        elementId: element.id,
        elementNom: element.nom,
        maisonNom: maison.nom,
        prestataireNom: prestataire.nom,
        prestataireTelephone: prestataire.telephone,
      })
      .from(entretien)
      .innerJoin(element, eq(element.id, entretien.elementId))
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .leftJoin(prestataire, eq(prestataire.id, entretien.prestataireId))
      .where(and(suivis, eq(entretien.actif, true)))
      .orderBy(asc(entretien.echeance)),
    db
      .select({ id: element.id, nom: element.nom, maisonNom: maison.nom, finGarantie: element.finGarantie })
      .from(element)
      .innerJoin(maison, eq(maison.id, element.maisonId))
      .where(and(suivis, isNotNull(element.finGarantie)))
      .orderBy(asc(element.finGarantie)),
  ]);
  return { entretiens, garanties: garanties as ((typeof garanties)[number] & { finGarantie: string })[] };
}

type Suivi = Awaited<ReturnType<typeof chargerSuivi>>;
type LigneEntretien = Suivi["entretiens"][number];
type LigneGarantie = Suivi["garanties"][number];

export type Alerte =
  | { type: "rdv_demain"; e: LigneEntretien }
  | { type: "en_retard"; e: LigneEntretien }
  | { type: "a_prevoir"; e: LigneEntretien }
  | { type: "garantie"; g: LigneGarantie };

export type Recapitulatif = { enRetard: LigneEntretien[]; aPrevoir: LigneEntretien[]; rendezVous: LigneEntretien[]; garanties: LigneGarantie[] };

export type Rappels = { jour: string; alertes: Alerte[]; recap: Recapitulatif | null };

/**
 * Rappels du `jour`. Si la dernière tournée date de plusieurs jours (serveur arrêté), les alertes des jours
 * manqués sont rattrapées (une semaine au plus) ; le récapitulatif part si l'un de ces jours est un lundi.
 */
export async function calculerRappels(jour: string, derniere: string | null, options: { suivi?: Suivi; recap?: boolean } = {}): Promise<Rappels> {
  const { entretiens, garanties } = options.suivi ?? (await chargerSuivi());
  let debut = derniere && derniere < jour ? ajouter(derniere, 1, "jour") : jour;
  if (joursEntre(debut, jour) > 6) debut = ajouter(jour, -6, "jour");
  const jours = new Set<string>();
  for (let d = debut; d <= jour; d = ajouter(d, 1, "jour")) jours.add(d);
  const lundi = options.recap ?? [...jours].some((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1);

  const alertes: Alerte[] = [];
  for (const e of entretiens) {
    if (e.etat === "rdv_pris") {
      if (e.dateRdv && jours.has(ajouter(e.dateRdv, -1, "jour"))) alertes.push({ type: "rdv_demain", e });
    } else if (jours.has(ajouter(e.echeance, 1, "jour"))) alertes.push({ type: "en_retard", e });
    else if (jours.has(ajouter(e.echeance, -e.delaiAlerteJours, "jour"))) alertes.push({ type: "a_prevoir", e });
  }
  for (const g of garanties) if (jours.has(ajouter(g.finGarantie, -1, "mois"))) alertes.push({ type: "garantie", g });

  let recap: Recapitulatif | null = null;
  if (lundi) {
    const s = entretiens.map((e) => ({ e, s: situation(e, jour) }));
    recap = {
      enRetard: s.filter((x) => x.s.etat === "en_retard").map((x) => x.e),
      aPrevoir: s.filter((x) => x.s.etat === "a_prevoir").map((x) => x.e),
      rendezVous: s.filter((x) => x.s.etat === "rdv_pris" && x.e.dateRdv && x.e.dateRdv >= jour && joursEntre(jour, x.e.dateRdv) <= 7).map((x) => x.e),
      garanties: garanties.filter((g) => g.finGarantie >= jour && g.finGarantie <= ajouter(jour, 1, "mois")),
    };
    if (!recap.enRetard.length && !recap.aPrevoir.length && !recap.rendezVous.length && !recap.garanties.length) recap = null;
  }
  return { jour, alertes, recap };
}

// --- Mise en forme

const ou = (e: { elementNom: string; maisonNom: string }) => `${e.elementNom}, ${e.maisonNom}`;
const action = (e: LigneEntretien) => (e.nature === "rdv" ? "rendez-vous à prendre" : "à faire");

function phrase(a: Alerte, jour: string) {
  switch (a.type) {
    case "rdv_demain": {
      const tel = a.e.prestataireTelephone ? ` (${a.e.prestataireNom}, ${a.e.prestataireTelephone})` : a.e.prestataireNom ? ` (${a.e.prestataireNom})` : "";
      return `Rendez-vous demain : ${a.e.titre} — ${ou(a.e)}${tel}`;
    }
    case "en_retard":
      return `En retard : ${a.e.titre} — ${ou(a.e)} (échéance du ${dateLisible(a.e.echeance)})`;
    case "a_prevoir":
      return `${a.e.nature === "rdv" ? "Rendez-vous à prendre" : "À faire"} : ${a.e.titre} — ${ou(a.e)}, avant le ${dateLisible(a.e.echeance)}`;
    case "garantie":
      return `Garantie : ${a.g.nom} (${a.g.maisonNom}) n'est plus garanti après le ${dateLisible(a.g.finGarantie)}${a.g.finGarantie < jour ? "" : ", dans un mois"}`;
  }
}

function sectionsRecap(r: Recapitulatif, jour: string) {
  return [
    { titre: "En retard", lignes: r.enRetard.map((e) => `${e.titre} — ${ou(e)} (depuis le ${dateLisible(e.echeance)})`) },
    { titre: "À prévoir", lignes: r.aPrevoir.map((e) => `${e.titre} — ${ou(e)} : ${action(e)} avant le ${dateLisible(e.echeance)}`) },
    { titre: "Rendez-vous de la semaine", lignes: r.rendezVous.map((e) => `${dateLisible(e.dateRdv, { weekday: "long", day: "numeric", month: "long" })} : ${e.titre} — ${ou(e)}`) },
    { titre: "Garanties qui expirent", lignes: r.garanties.map((g) => `${g.nom} (${g.maisonNom}) : le ${dateLisible(g.finGarantie)}${g.finGarantie === jour ? " (aujourd'hui)" : ""}`) },
  ].filter((s) => s.lignes.length);
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** E-mail (texte et HTML) et notification push ; null s'il n'y a rien à dire. */
export function composer(r: Rappels, urlApplication: string): (Message & { push: { titre: string; corps: string; url: string } }) | null {
  if (!r.alertes.length && !r.recap) return null;
  const alertes = r.alertes.map((a) => phrase(a, r.jour));
  const recap = r.recap ? sectionsRecap(r.recap, r.jour) : [];
  const nbRecap = r.recap ? r.recap.enRetard.length + r.recap.aPrevoir.length : 0;

  const sujet =
    alertes.length === 1 && !r.recap
      ? alertes[0].split(" — ")[0]
      : r.recap
        ? `Votre semaine : ${[r.recap.enRetard.length && `${r.recap.enRetard.length} en retard`, r.recap.aPrevoir.length && `${r.recap.aPrevoir.length} à prévoir`, r.recap.rendezVous.length && `${r.recap.rendezVous.length} rendez-vous`].filter(Boolean).join(", ") || "garanties à surveiller"}`
        : `${alertes.length} rappels pour vos maisons`;

  const lien = urlApplication || "";
  const texte = [
    ...(alertes.length ? ["Aujourd'hui :", ...alertes.map((a) => `- ${a}`), ""] : []),
    ...recap.flatMap((s) => [`${s.titre} :`, ...s.lignes.map((l) => `- ${l}`), ""]),
    lien ? `Ouvrir Custos Domus : ${lien}` : "",
    "",
    "Vous recevez ce message car les rappels par e-mail sont activés dans Custos Domus (page Notifications).",
  ].join("\n");

  const liste = (lignes: string[]) => `<ul style="margin:0 0 16px;padding-left:20px">${lignes.map((l) => `<li style="margin:4px 0">${echapper(l)}</li>`).join("")}</ul>`;
  const titre = (t: string) => `<h3 style="font-family:Georgia,serif;color:#8f3d21;margin:16px 0 6px;font-size:16px">${echapper(t)}</h3>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#fbf7f2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2420">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fffdfa;border:1px solid #e8ddd1;border-radius:10px;padding:20px 24px">
<p style="margin:0 0 4px;font-family:Georgia,serif;font-size:20px;color:#d4603a">Custos Domus</p>
<p style="margin:0 0 12px;color:#7a6e66;font-size:13px">${echapper(dateLisible(r.jour, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</p>
${alertes.length ? titre("Aujourd'hui") + liste(alertes) : ""}
${recap.map((s) => titre(s.titre) + liste(s.lignes)).join("")}
${lien ? `<p style="margin:20px 0 4px"><a href="${echapper(lien)}" style="background:#d4603a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Ouvrir Custos Domus</a></p>` : ""}
</div>
<p style="color:#7a6e66;font-size:12px;margin:12px 4px">Vous recevez ce message car les rappels par e-mail sont activés dans Custos Domus (page Notifications).</p>
</div></body></html>`;

  const corps = alertes.length
    ? alertes.length === 1
      ? alertes[0].split(" — ").slice(1).join(" — ") || alertes[0]
      : alertes.map((a) => a.split(" — ")[0]).join(" · ")
    : `${nbRecap} entretien${nbRecap > 1 ? "s" : ""} à suivre cette semaine`;
  return { sujet, texte, html, push: { titre: alertes.length === 1 && !r.recap ? sujet : "Custos Domus", corps, url: "/" } };
}

// --- Envoi

export type BilanTournee = { jour: string; alertes: number; recap: boolean; emails: number; notifications: number; erreurs: string[] };

/** La tournée : calcule les rappels une fois (les données sont communes), puis les envoie à chacun selon ses canaux. */
export async function envoyerRappels(maintenant = new Date()): Promise<BilanTournee> {
  const { jour } = maintenantLocal(maintenant);
  const r = await calculerRappels(jour, derniereTournee());
  const config = configEnvoi();
  const message = composer(r, config.urlApplication);
  const bilan: BilanTournee = { jour, alertes: r.alertes.length, recap: !!r.recap, emails: 0, notifications: 0, erreurs: [] };
  if (message)
    for (const d of destinataires()) {
      if (d.email && envoiEmailPossible())
        try {
          await envoyerEmail(d.adresse, message);
          bilan.emails++;
        } catch (e) {
          bilan.erreurs.push(`E-mail à ${d.adresse} : ${(e as Error).message}`);
        }
      if (d.push)
        for (const a of abonnementsDe(d.id)) {
          const res = await envoyerPush(a, message.push);
          if (res === "ok") bilan.notifications++;
          else if (res !== "expire") bilan.erreurs.push(`Notification à ${d.adresse} : ${res}`);
        }
    }
  noterTournee(jour);
  if (bilan.erreurs.length) console.error(`Rappels du ${jour} :`, bilan.erreurs.join(" ; "));
  return bilan;
}

/** Vérifie toutes les 5 minutes s'il est l'heure de la tournée du jour (rattrapée au redémarrage si besoin). */
export function planifierRappels() {
  let enCours = false;
  const verifier = async () => {
    const { jour, heure } = maintenantLocal();
    if (enCours || heure < HEURE_RAPPELS || (derniereTournee() ?? "") >= jour) return;
    enCours = true;
    try {
      const b = await envoyerRappels();
      if (b.alertes || b.recap) console.log(`Rappels du ${b.jour} : ${b.emails} e-mail(s), ${b.notifications} notification(s)`);
    } catch (e) {
      console.error("Tournée des rappels :", e);
    } finally {
      enCours = false;
    }
  };
  verifier();
  return setInterval(verifier, 5 * 60 * 1000);
}
