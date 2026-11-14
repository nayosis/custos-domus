import { sqliteTable, text, integer, real, index, primaryKey, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
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
/**
 * Un équipement d'une maison, ou un véhicule (type « vehicule », sans maison : la voiture n'est pas un
 * équipement de la maison ; immatriculation et relevés de compteur).
 */
export const element = sqliteTable(
  "element",
  {
    id: id(),
    /** equipement, vehicule */
    type: text("type").notNull().default("equipement"),
    /** Toujours renseignée pour un équipement, vide pour un véhicule. */
    maisonId: text("maison_id").references(() => maison.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    immatriculation: text("immatriculation"),
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
 * Une chose à faire, sur un élément ou directement sur la maison (sortir les poubelles) : une tâche à faire
 * soi-même, un rendez-vous à prendre, ou une routine (ni coût ni prestataire).
 * Récurrente (intervalle renseigné) ou ponctuelle (intervalle vide : close une fois réalisée).
 * Soit elementId (la maison est celle de l'élément), soit maisonId — jamais les deux.
 */
export const entretien = sqliteTable(
  "entretien",
  {
    id: id(),
    elementId: text("element_id").references(() => element.id, { onDelete: "cascade" }),
    maisonId: text("maison_id").references(() => maison.id, { onDelete: "cascade" }),
    titre: text("titre").notNull(),
    /**
     * Il faut d'abord prendre rendez-vous (prestataire, contrôle technique…) : étape « rendez-vous pris » en plus.
     * Le reste se déduit : avec un intervalle c'est une routine, sans c'est une tâche ; qui s'en charge, voir lib/entretiens (quiDe).
     */
    avecRdv: integer("avec_rdv", { mode: "boolean" }).notNull().default(false),
    intervalleValeur: integer("intervalle_valeur"),
    /** jour, semaine, mois, an */
    intervalleUnite: text("intervalle_unite"),
    /** realisation : prochaine = date réalisée + intervalle ; fixe : prochaine = échéance précédente + intervalle. */
    ancrage: text("ancrage").notNull().default("realisation"),
    echeance: text("echeance").notNull(),
    /** Échéance reportée : sa date d'origine, d'où repart le rythme (vide sinon). */
    echeanceInitiale: text("echeance_initiale"),
    /** Combien de jours avant l'échéance on est prévenu. */
    delaiAlerteJours: integer("delai_alerte_jours").notNull(),
    /** a_faire, rdv_pris */
    etat: text("etat").notNull().default("a_faire"),
    dateRdv: text("date_rdv"),
    /** Heure du rendez-vous « HH:MM » (vide : journée entière) et durée en minutes. */
    heureRdv: text("heure_rdv"),
    dureeRdvMinutes: integer("duree_rdv_minutes"),
    prestataireId: text("prestataire_id").references(() => prestataire.id, { onDelete: "set null" }),
    notes: text("notes"),
    actif: integer("actif", { mode: "boolean" }).notNull().default(true),
    /**
     * Véhicule : « ou tous les N km, au premier atteint ». kmEcheance : kilométrage visé ; echeanceTemps :
     * l'échéance au temps seule. `echeance` est alors la plus proche des deux (date estimée d'après les relevés).
     */
    intervalleKm: integer("intervalle_km"),
    kmEcheance: integer("km_echeance"),
    echeanceTemps: text("echeance_temps"),
    /**
     * Mission confiée aux enfants : points gagnés (vide : pas une mission), et l'enfant s'il est seul
     * (vide si elle est partagée ; tous ceux à qui elle est confiée sont dans mission_tour).
     */
    points: integer("points"),
    enfantId: text("enfant_id").references((): AnySQLiteColumn => enfant.id, { onDelete: "set null" }),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("entretien_element_idx").on(t.elementId), index("entretien_maison_idx").on(t.maisonId), index("entretien_echeance_idx").on(t.echeance)],
);

/**
 * Ce qui a été fait : une chose à faire réalisée, ou une intervention ponctuelle consignée (réparation…).
 * Comme la chose à faire : soit elementId, soit maisonId.
 */
export const realisation = sqliteTable(
  "realisation",
  {
    id: id(),
    elementId: text("element_id").references(() => element.id, { onDelete: "cascade" }),
    maisonId: text("maison_id").references(() => maison.id, { onDelete: "cascade" }),
    /** Vide : intervention ponctuelle sans entretien prévu. */
    entretienId: text("entretien_id").references(() => entretien.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    titre: text("titre").notNull(),
    note: text("note"),
    cout: real("cout"),
    prestataireId: text("prestataire_id").references(() => prestataire.id, { onDelete: "set null" }),
    /** Occurrence passée (sautée) volontairement : ni dépense ni statistique ; la note porte le motif. */
    passee: integer("passee", { mode: "boolean" }).notNull().default(false),
    /** Véhicule : kilométrage au moment de l'intervention. */
    kilometrage: integer("kilometrage"),
    /** Mission faite par un enfant (celui qui l'a cochée) : ses points (total, partagé dans part_mission) et leur validation (a_valider, validee, refusee). */
    enfantId: text("enfant_id").references((): AnySQLiteColumn => enfant.id, { onDelete: "set null" }),
    points: integer("points"),
    validation: text("validation"),
    validePar: text("valide_par"),
    valideLe: text("valide_le"),
    /** État de la mission avant (JSON) : remis en place si un parent refuse. */
    avant: text("avant"),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("realisation_element_idx").on(t.elementId), index("realisation_maison_idx").on(t.maisonId), index("realisation_date_idx").on(t.date)],
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
  avecRdv: integer("avec_rdv", { mode: "boolean" }).notNull().default(false),
  intervalleValeur: integer("intervalle_valeur"),
  intervalleUnite: text("intervalle_unite"),
  intervalleKm: integer("intervalle_km"),
  delaiAlerteJours: integer("delai_alerte_jours").notNull(),
  description: text("description"),
  creeLe: creeLe(),
});

/** Relevé du compteur d'un véhicule (demandé chaque mois) : sert à estimer quand tombent les entretiens au kilométrage. */
export const releve = sqliteTable(
  "releve",
  {
    id: id(),
    elementId: text("element_id")
      .notNull()
      .references(() => element.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    km: integer("km").notNull(),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("releve_element_idx").on(t.elementId, t.date)],
);

/**
 * Un enfant de la famille : il se connecte avec son prénom et un code PIN, et ne voit que ses missions.
 * Après 10 codes faux de suite, il est bloqué jusqu'à ce qu'un parent lui donne un nouveau code.
 */
export const enfant = sqliteTable("enfant", {
  id: id(),
  prenom: text("prenom").notNull(),
  pinHash: text("pin_hash").notNull(),
  echecsPin: integer("echecs_pin").notNull().default(0),
  /** Points visés chaque semaine (du lundi au dimanche). */
  objectifSemaine: integer("objectif_semaine").notNull().default(50),
  actif: integer("actif", { mode: "boolean" }).notNull().default(true),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** À qui une mission est confiée (un seul enfant : la sienne ; plusieurs : partagée, le premier qui la fait gagne les points). */
export const missionTour = sqliteTable(
  "mission_tour",
  {
    entretienId: text("entretien_id")
      .notNull()
      .references(() => entretien.id, { onDelete: "cascade" }),
    enfantId: text("enfant_id")
      .notNull()
      .references(() => enfant.id, { onDelete: "cascade" }),
    ordre: integer("ordre").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entretienId, t.enfantId] }), index("mission_tour_enfant_idx").on(t.enfantId)],
);

/**
 * Les points d'une mission faite par un ou plusieurs enfants : la part de chacun (celui qui l'a cochée compris).
 * Comptés une fois la réalisation validée ; la somme des parts fait les points de la mission.
 */
export const partMission = sqliteTable(
  "part_mission",
  {
    realisationId: text("realisation_id")
      .notNull()
      .references(() => realisation.id, { onDelete: "cascade" }),
    enfantId: text("enfant_id")
      .notNull()
      .references(() => enfant.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
  },
  (t) => [primaryKey({ columns: [t.realisationId, t.enfantId] }), index("part_mission_enfant_idx").on(t.enfantId)],
);

/** Récompense définie par les parents, échangeable contre des points. */
export const recompense = sqliteTable("recompense", {
  id: id(),
  titre: text("titre").notNull(),
  points: integer("points").notNull(),
  actif: integer("actif", { mode: "boolean" }).notNull().default(true),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** Demande d'un enfant : une récompense contre des points (demandee, accordee, refusee). */
export const echange = sqliteTable(
  "echange",
  {
    id: id(),
    enfantId: text("enfant_id")
      .notNull()
      .references(() => enfant.id, { onDelete: "cascade" }),
    recompenseId: text("recompense_id").references(() => recompense.id, { onDelete: "set null" }),
    titre: text("titre").notNull(),
    points: integer("points").notNull(),
    statut: text("statut").notNull().default("demandee"),
    reponduPar: text("repondu_par"),
    reponduLe: text("repondu_le"),
    creeLe: creeLe(),
  },
  (t) => [index("echange_enfant_idx").on(t.enfantId)],
);

export type Enfant = typeof enfant.$inferSelect;
export type Recompense = typeof recompense.$inferSelect;
export type Echange = typeof echange.$inferSelect;
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
export type Releve = typeof releve.$inferSelect;
