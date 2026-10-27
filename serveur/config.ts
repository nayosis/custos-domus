import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Installation } from "../src/lib/versions";

/** Dossier des données : base, comptes, fichiers (factures, photos…). Volume Docker en production (/data). */
export const DOSSIER_DONNEES = resolve(process.env.DOSSIER_DONNEES ?? join(import.meta.dir, "..", "data"));
export const DOSSIER_FICHIERS = join(DOSSIER_DONNEES, "fichiers");
export const BASE_DONNEES = join(DOSSIER_DONNEES, "donnees.db");
export const BASE_COMPTES = join(DOSSIER_DONNEES, "comptes.db");

/** Front compilé (vite build), servi par le même serveur en production. */
export const DOSSIER_CLIENT = resolve(process.env.DOSSIER_CLIENT ?? join(import.meta.dir, "..", "dist"));
export const DOSSIER_MIGRATIONS = resolve(process.env.DOSSIER_MIGRATIONS ?? join(import.meta.dir, "..", "drizzle"));

export const PORT = Number(process.env.PORT ?? 3210);

/** Version du programme (package.json), affichée dans l'interface et par /api/sante. */
export const VERSION: string = (await import("../package.json")).version;

/** Type d'installation (docker : fixé par l'image) : dit comment mettre à jour. */
export const INSTALLATION: Installation = process.env.CUSTOS_INSTALLATION === "docker" ? "docker" : "source";

/** Vérifier sur GitHub qu'une nouvelle version existe (désactivable : CUSTOS_VERIFIER_MISES_A_JOUR=non). */
/** Fuseau des rappels (8 h) et des dates du jour. */
export const FUSEAU = process.env.TZ || "Europe/Paris";

export const VERIFIER_MISES_A_JOUR = !["non", "no", "false", "0"].includes((process.env.CUSTOS_VERIFIER_MISES_A_JOUR ?? "").toLowerCase());

export function preparerDossiers() {
  mkdirSync(DOSSIER_FICHIERS, { recursive: true });
}
