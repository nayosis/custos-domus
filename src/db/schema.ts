import { sqliteTable, text, integer, real, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/*
 * Modèle : Maison → Élément ─┬→ Entretien (à venir : récurrent ou ponctuel)
 *                            ├→ Réalisation (historique : entretien fait, réparation)
 *                            └→ Document (facture, garantie, notice…)
 * Prestataire : lié aux entretiens et aux réalisations.
 * Dates : chaînes ISO « AAAA-MM-JJ ».
 */

const id = () => text("id").primaryKey();
const creeLe = () => text("cree_le").notNull().default(sql`(datetime('now'))`);

/**
 * Qui a créé / modifié la ligne, et quand (ISO, à la milliseconde). Remplies par le serveur
 * (déclencheurs SQLite, cf. serveur/tracabilite.ts) ; `modifieLe` sert aussi de version (conflits).
 */
const tracabilite = () => ({
  creePar: text("cree_par"),
  modifiePar: text("modifie_par"),
  modifieLe: text("modifie_le"),
});

/** Une maison (un foyer) : la sienne, une maison mise en location… */
export const maison = sqliteTable("maison", {
  id: id(),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  notes: text("notes"),
  archivee: integer("archivee", { mode: "boolean" }).notNull().default(false),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** Artisan, entreprise, service après-vente : qui intervient. */
export const prestataire = sqliteTable("prestataire", {
  id: id(),
  nom: text("nom").notNull(),
  metier: text("metier"),
  telephone: text("telephone"),
  email: text("email"),
  notes: text("notes"),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** Un équipement de la maison (fosse septique, PAC) ou un bien acheté (PC, lave-linge). */
export const element = sqliteTable(
  "element",
  {
    id: id(),
    maisonId: text("maison_id")
      .notNull()
      .references(() => maison.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    categorie: text("categorie"),
    /** Texte libre : « garage », « jardin, côté nord »… */
    emplacement: text("emplacement"),
    marque: text("marque"),
    modele: text("modele"),
    numeroSerie: text("numero_serie"),
    dateAchat: text("date_achat"),
    /** Date d'installation : c'est souvent elle qui fait courir la garantie. */
    dateMiseEnService: text("date_mise_en_service"),
    prix: real("prix"),
    vendeur: text("vendeur"),
    finGarantie: text("fin_garantie"),
    notes: text("notes"),
    /** Retiré (vendu, jeté, remplacé) : gardé pour l'historique, plus d'alertes. */
    archive: integer("archive", { mode: "boolean" }).notNull().default(false),
    remplacePar: text("remplace_par").references((): AnySQLiteColumn => element.id, { onDelete: "set null" }),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("element_maison_idx").on(t.maisonId)],
);

/**
 * Ce qu'il y a à faire sur un élément : une tâche à faire soi-même ou un rendez-vous à prendre.
 * Récurrent (intervalle renseigné) ou ponctuel (intervalle vide : clos une fois réalisé).
 */
export const entretien = sqliteTable(
  "entretien",
  {
    id: id(),
    elementId: text("element_id")
      .notNull()
      .references(() => element.id, { onDelete: "cascade" }),
    titre: text("titre").notNull(),
    /** tache, rdv */
    nature: text("nature").notNull().default("tache"),
    intervalleValeur: integer("intervalle_valeur"),
    /** jour, mois, an */
    intervalleUnite: text("intervalle_unite"),
    /** realisation : prochaine = date réalisée + intervalle ; fixe : prochaine = échéance précédente + intervalle. */
    ancrage: text("ancrage").notNull().default("realisation"),
    echeance: text("echeance").notNull(),
    /** Combien de jours avant l'échéance on est prévenu. */
    delaiAlerteJours: integer("delai_alerte_jours").notNull(),
    /** a_faire, rdv_pris */
    etat: text("etat").notNull().default("a_faire"),
    dateRdv: text("date_rdv"),
    prestataireId: text("prestataire_id").references(() => prestataire.id, { onDelete: "set null" }),
    notes: text("notes"),
    actif: integer("actif", { mode: "boolean" }).notNull().default(true),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("entretien_element_idx").on(t.elementId), index("entretien_echeance_idx").on(t.echeance)],
);

/** Ce qui a été fait : un entretien réalisé, ou une intervention ponctuelle consignée (réparation…). */
export const realisation = sqliteTable(
  "realisation",
  {
    id: id(),
    elementId: text("element_id")
      .notNull()
      .references(() => element.id, { onDelete: "cascade" }),
    /** Vide : intervention ponctuelle sans entretien prévu. */
    entretienId: text("entretien_id").references(() => entretien.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    titre: text("titre").notNull(),
    note: text("note"),
    cout: real("cout"),
    prestataireId: text("prestataire_id").references(() => prestataire.id, { onDelete: "set null" }),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("realisation_element_idx").on(t.elementId), index("realisation_date_idx").on(t.date)],
);

/** Un fichier (PDF, photo) rattaché à un élément ou à une réalisation. */
export const document = sqliteTable(
  "document",
  {
    id: id(),
    elementId: text("element_id").references(() => element.id, { onDelete: "cascade" }),
    realisationId: text("realisation_id").references(() => realisation.id, { onDelete: "cascade" }),
    /** facture, garantie, rapport, notice, photo, autre */
    type: text("type").notNull().default("autre"),
    /** Nom affiché (celui du fichier envoyé, modifiable). */
    nom: text("nom").notNull(),
    /** Nom sur le disque, choisi par le serveur (UUID + extension). */
    fichier: text("fichier").notNull(),
    mime: text("mime").notNull(),
    taille: integer("taille").notNull(),
    date: text("date"),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("document_element_idx").on(t.elementId), index("document_realisation_idx").on(t.realisationId)],
);

/** Bibliothèque : entretiens types qu'on applique en un clic à un élément. */
export const modeleEntretien = sqliteTable("modele_entretien", {
  id: id(),
  titre: text("titre").notNull(),
  categorie: text("categorie"),
  nature: text("nature").notNull().default("tache"),
  intervalleValeur: integer("intervalle_valeur"),
  intervalleUnite: text("intervalle_unite"),
  delaiAlerteJours: integer("delai_alerte_jours").notNull(),
  description: text("description"),
  creeLe: creeLe(),
});

export type Maison = typeof maison.$inferSelect;
export type Prestataire = typeof prestataire.$inferSelect;
export type Element = typeof element.$inferSelect;
export type Entretien = typeof entretien.$inferSelect;
export type Realisation = typeof realisation.$inferSelect;
export type Document = typeof document.$inferSelect;
export type ModeleEntretien = typeof modeleEntretien.$inferSelect;

/** Journal des modifications : une ligne par action d'écriture (fonction appelée, par qui, sur quoi). */
export const journal = sqliteTable(
  "journal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quand: text("quand").notNull(),
    utilisateur: text("utilisateur").notNull(),
    fonction: text("fonction").notNull(),
    cible: text("cible"),
    resume: text("resume"),
  },
  (t) => [index("journal_quand_idx").on(t.quand), index("journal_utilisateur_idx").on(t.utilisateur)],
);
