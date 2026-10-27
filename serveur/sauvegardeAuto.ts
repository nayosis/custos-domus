/*
 * Sauvegarde automatique : chaque nuit (à partir de 3 h, fuseau de l'installation), un ZIP complet
 * — le même que la sauvegarde téléchargée, donc restaurable — dans data/sauvegardes, en gardant les 14 derniers.
 * Elle tourne sur le même disque que les données : il faut la recopier ailleurs (sauvegardes de la machine).
 *
 * Après la sauvegarde, les fichiers orphelins (envoyés mais jamais rattachés à un document, ou restés
 * après une restauration) sont effacés au bout de 7 jours : ils figurent encore dans les sauvegardes récentes.
 */
import { closeSync, existsSync, openSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { maintenantLocal } from "../src/lib/dates";
import { query } from "../src/db/client";
import { DOSSIER_FICHIERS, DOSSIER_SAUVEGARDES, SAUVEGARDES_CONSERVEES } from "./config";
import { nomValide } from "./fichiers";
import { ecrireReglage, lireReglage } from "./reglages";
import { fluxSauvegarde, nomSauvegarde } from "./sauvegarde";

/** Heure à partir de laquelle part la sauvegarde de la nuit. */
export const HEURE_SAUVEGARDE = 3;
const ORPHELINS_APRES_JOURS = 7;

const NOM = /^custos-domus-sauvegarde-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}(-\d+)?\.zip$/;
export const nomSauvegardeValide = (nom: string) => NOM.test(nom);
export const cheminSauvegarde = (nom: string) => {
  if (!nomSauvegardeValide(nom)) throw new Error(`Nom de sauvegarde invalide : ${nom}`);
  return join(DOSSIER_SAUVEGARDES, nom);
};

export type InfoSauvegarde = { nom: string; taille: number; le: string };

/** Sauvegardes présentes, de la plus récente à la plus ancienne. */
export function listeSauvegardes(): InfoSauvegarde[] {
  if (!existsSync(DOSSIER_SAUVEGARDES)) return [];
  return readdirSync(DOSSIER_SAUVEGARDES)
    .filter(nomSauvegardeValide)
    .map((nom) => {
      const s = statSync(join(DOSSIER_SAUVEGARDES, nom));
      return { nom, taille: s.size, le: s.mtime.toISOString() };
    })
    .sort((a, b) => b.le.localeCompare(a.le) || b.nom.localeCompare(a.nom));
}

/** Ne garde que les `conserver` plus récentes. Renvoie les noms effacés. */
export function rotation(conserver = SAUVEGARDES_CONSERVEES) {
  const effacees = listeSauvegardes().slice(conserver);
  for (const s of effacees) unlinkSync(join(DOSSIER_SAUVEGARDES, s.nom));
  return effacees.map((s) => s.nom);
}

/** Écrit une sauvegarde complète dans le dossier (fichier temporaire, renommé une fois complet). */
export async function sauvegarder(motif: "nuit" | "manuelle", maintenant = new Date()): Promise<InfoSauvegarde> {
  let nom = nomSauvegarde(maintenant);
  for (let i = 2; existsSync(join(DOSSIER_SAUVEGARDES, nom)); i++) nom = nomSauvegarde(maintenant).replace(/\.zip$/, `-${i}.zip`);
  const chemin = join(DOSSIER_SAUVEGARDES, nom);
  const partiel = `${chemin}.partiel`;
  try {
    // Écriture bloc par bloc (Bun.write d'un flux ne se termine pas toujours sous Windows).
    const fd = openSync(partiel, "w");
    try {
      for await (const bloc of fluxSauvegarde(motif)) writeSync(fd, bloc);
    } finally {
      closeSync(fd);
    }
    renameSync(partiel, chemin);
  } finally {
    if (existsSync(partiel)) unlinkSync(partiel);
  }
  const s = statSync(chemin);
  return { nom, taille: s.size, le: s.mtime.toISOString() };
}

/** Efface les fichiers qu'aucun document ne cite depuis plus de `jours` jours. Renvoie leur nombre. */
export async function nettoyerOrphelins(jours = ORPHELINS_APRES_JOURS, maintenant = Date.now()) {
  if (!existsSync(DOSSIER_FICHIERS)) return 0;
  const cites = new Set((await query("select fichier from document")).map((l) => l[0] as string));
  let n = 0;
  for (const nom of readdirSync(DOSSIER_FICHIERS).filter(nomValide)) {
    if (cites.has(nom)) continue;
    const chemin = join(DOSSIER_FICHIERS, nom);
    if (maintenant - statSync(chemin).mtimeMs < jours * 86_400_000) continue;
    unlinkSync(chemin);
    n++;
  }
  return n;
}

export type EtatSauvegardeAuto = { jour: string; le: string; nom?: string; taille?: number; effacees?: string[]; orphelins?: number; erreur?: string };

export const etatSauvegardeAuto = (): EtatSauvegardeAuto | null => {
  const brut = lireReglage("sauvegarde_auto");
  return brut ? (JSON.parse(brut) as EtatSauvegardeAuto) : null;
};

/**
 * La sauvegarde de la nuit (ou demandée depuis la page Sauvegarde) : sauvegarde, rotation, puis nettoyage
 * des orphelins. Résultat (ou erreur) gardé pour la page ; une sauvegarde réussie dans la journée tient lieu de celle de la nuit.
 */
export async function sauvegardeDeNuit(maintenant = new Date(), motif: "nuit" | "manuelle" = "nuit"): Promise<EtatSauvegardeAuto> {
  const { jour } = maintenantLocal(maintenant);
  let etat: EtatSauvegardeAuto;
  try {
    const s = await sauvegarder(motif, maintenant);
    const effacees = rotation();
    const orphelins = await nettoyerOrphelins(ORPHELINS_APRES_JOURS, maintenant.getTime());
    etat = { jour, le: maintenant.toISOString(), nom: s.nom, taille: s.taille, effacees, orphelins };
  } catch (e) {
    etat = { jour, le: maintenant.toISOString(), erreur: (e as Error).message };
    console.error("Sauvegarde de la nuit :", e);
  }
  ecrireReglage("sauvegarde_auto", JSON.stringify(etat));
  return etat;
}

/** Vérifie toutes les 10 minutes si la sauvegarde du jour est faite (rattrapée au redémarrage). */
export function planifierSauvegardes() {
  let enCours = false;
  const verifier = async () => {
    const { jour, heure } = maintenantLocal();
    const derniere = etatSauvegardeAuto();
    // Faite aujourd'hui ; en cas d'échec, nouvel essai une heure plus tard.
    const faite = (derniere?.jour ?? "") >= jour && !(derniere?.erreur && Date.now() - Date.parse(derniere.le) > 3600_000);
    if (enCours || heure < HEURE_SAUVEGARDE || faite) return;
    enCours = true;
    try {
      const e = await sauvegardeDeNuit();
      if (!e.erreur) console.log(`Sauvegarde de la nuit : ${e.nom}${e.orphelins ? `, ${e.orphelins} fichier(s) orphelin(s) effacé(s)` : ""}`);
    } finally {
      enCours = false;
    }
  };
  verifier();
  return setInterval(verifier, 10 * 60 * 1000);
}
