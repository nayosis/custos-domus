-- Famille : enfants (connexion par code PIN), missions (points, à tour de rôle), validation, récompenses.
CREATE TABLE `echange` (
	`id` text PRIMARY KEY NOT NULL,
	`enfant_id` text NOT NULL,
	`recompense_id` text,
	`titre` text NOT NULL,
	`points` integer NOT NULL,
	`statut` text DEFAULT 'demandee' NOT NULL,
	`repondu_par` text,
	`repondu_le` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`enfant_id`) REFERENCES `enfant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recompense_id`) REFERENCES `recompense`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `echange_enfant_idx` ON `echange` (`enfant_id`);--> statement-breakpoint
CREATE TABLE `enfant` (
	`id` text PRIMARY KEY NOT NULL,
	`prenom` text NOT NULL,
	`pin_hash` text NOT NULL,
	`echecs_pin` integer DEFAULT 0 NOT NULL,
	`objectif_semaine` integer DEFAULT 50 NOT NULL,
	`actif` integer DEFAULT true NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
CREATE TABLE `mission_tour` (
	`entretien_id` text NOT NULL,
	`enfant_id` text NOT NULL,
	`ordre` integer NOT NULL,
	PRIMARY KEY(`entretien_id`, `enfant_id`),
	FOREIGN KEY (`entretien_id`) REFERENCES `entretien`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enfant_id`) REFERENCES `enfant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mission_tour_enfant_idx` ON `mission_tour` (`enfant_id`);--> statement-breakpoint
CREATE TABLE `recompense` (
	`id` text PRIMARY KEY NOT NULL,
	`titre` text NOT NULL,
	`points` integer NOT NULL,
	`actif` integer DEFAULT true NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
ALTER TABLE `entretien` ADD `points` integer;--> statement-breakpoint
ALTER TABLE `entretien` ADD `enfant_id` text REFERENCES enfant(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `realisation` ADD `enfant_id` text REFERENCES enfant(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `realisation` ADD `points` integer;--> statement-breakpoint
ALTER TABLE `realisation` ADD `validation` text;--> statement-breakpoint
ALTER TABLE `realisation` ADD `valide_par` text;--> statement-breakpoint
ALTER TABLE `realisation` ADD `valide_le` text;--> statement-breakpoint
ALTER TABLE `realisation` ADD `avant` text;