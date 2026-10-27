CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text,
	`realisation_id` text,
	`type` text DEFAULT 'autre' NOT NULL,
	`nom` text NOT NULL,
	`fichier` text NOT NULL,
	`mime` text NOT NULL,
	`taille` integer NOT NULL,
	`date` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`realisation_id`) REFERENCES `realisation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_element_idx` ON `document` (`element_id`);--> statement-breakpoint
CREATE INDEX `document_realisation_idx` ON `document` (`realisation_id`);--> statement-breakpoint
CREATE TABLE `element` (
	`id` text PRIMARY KEY NOT NULL,
	`maison_id` text NOT NULL,
	`nom` text NOT NULL,
	`categorie` text,
	`emplacement` text,
	`marque` text,
	`modele` text,
	`numero_serie` text,
	`date_achat` text,
	`date_mise_en_service` text,
	`prix` real,
	`vendeur` text,
	`fin_garantie` text,
	`notes` text,
	`archive` integer DEFAULT false NOT NULL,
	`remplace_par` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`maison_id`) REFERENCES `maison`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`remplace_par`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `element_maison_idx` ON `element` (`maison_id`);--> statement-breakpoint
CREATE TABLE `entretien` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text NOT NULL,
	`titre` text NOT NULL,
	`nature` text DEFAULT 'tache' NOT NULL,
	`intervalle_valeur` integer,
	`intervalle_unite` text,
	`ancrage` text DEFAULT 'realisation' NOT NULL,
	`echeance` text NOT NULL,
	`delai_alerte_jours` integer NOT NULL,
	`etat` text DEFAULT 'a_faire' NOT NULL,
	`date_rdv` text,
	`prestataire_id` text,
	`notes` text,
	`actif` integer DEFAULT true NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prestataire_id`) REFERENCES `prestataire`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `entretien_element_idx` ON `entretien` (`element_id`);--> statement-breakpoint
CREATE INDEX `entretien_echeance_idx` ON `entretien` (`echeance`);--> statement-breakpoint
CREATE TABLE `journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quand` text NOT NULL,
	`utilisateur` text NOT NULL,
	`fonction` text NOT NULL,
	`cible` text,
	`resume` text
);
--> statement-breakpoint
CREATE INDEX `journal_quand_idx` ON `journal` (`quand`);--> statement-breakpoint
CREATE INDEX `journal_utilisateur_idx` ON `journal` (`utilisateur`);--> statement-breakpoint
CREATE TABLE `maison` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`adresse` text,
	`notes` text,
	`archivee` integer DEFAULT false NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
CREATE TABLE `modele_entretien` (
	`id` text PRIMARY KEY NOT NULL,
	`titre` text NOT NULL,
	`categorie` text,
	`nature` text DEFAULT 'tache' NOT NULL,
	`intervalle_valeur` integer,
	`intervalle_unite` text,
	`delai_alerte_jours` integer NOT NULL,
	`description` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prestataire` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`metier` text,
	`telephone` text,
	`email` text,
	`notes` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
CREATE TABLE `realisation` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text NOT NULL,
	`entretien_id` text,
	`date` text NOT NULL,
	`titre` text NOT NULL,
	`note` text,
	`cout` real,
	`prestataire_id` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entretien_id`) REFERENCES `entretien`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prestataire_id`) REFERENCES `prestataire`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `realisation_element_idx` ON `realisation` (`element_id`);--> statement-breakpoint
CREATE INDEX `realisation_date_idx` ON `realisation` (`date`);