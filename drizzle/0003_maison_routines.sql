-- Choses à faire sur la maison elle-même (sans élément), et routines.
-- entretien et realisation : element_id devient facultatif, maison_id apparaît (l'un ou l'autre).
CREATE TABLE `__new_entretien` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text,
	`maison_id` text,
	`titre` text NOT NULL,
	`nature` text DEFAULT 'tache' NOT NULL,
	`intervalle_valeur` integer,
	`intervalle_unite` text,
	`ancrage` text DEFAULT 'realisation' NOT NULL,
	`echeance` text NOT NULL,
	`echeance_initiale` text,
	`delai_alerte_jours` integer NOT NULL,
	`etat` text DEFAULT 'a_faire' NOT NULL,
	`date_rdv` text,
	`heure_rdv` text,
	`duree_rdv_minutes` integer,
	`prestataire_id` text,
	`notes` text,
	`actif` integer DEFAULT true NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maison_id`) REFERENCES `maison`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prestataire_id`) REFERENCES `prestataire`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_entretien`("id", "element_id", "maison_id", "titre", "nature", "intervalle_valeur", "intervalle_unite", "ancrage", "echeance", "echeance_initiale", "delai_alerte_jours", "etat", "date_rdv", "heure_rdv", "duree_rdv_minutes", "prestataire_id", "notes", "actif", "cree_le", "cree_par", "modifie_par", "modifie_le") SELECT "id", "element_id", NULL, "titre", "nature", "intervalle_valeur", "intervalle_unite", "ancrage", "echeance", "echeance_initiale", "delai_alerte_jours", "etat", "date_rdv", "heure_rdv", "duree_rdv_minutes", "prestataire_id", "notes", "actif", "cree_le", "cree_par", "modifie_par", "modifie_le" FROM `entretien`;--> statement-breakpoint
DROP TABLE `entretien`;--> statement-breakpoint
ALTER TABLE `__new_entretien` RENAME TO `entretien`;--> statement-breakpoint
CREATE INDEX `entretien_element_idx` ON `entretien` (`element_id`);--> statement-breakpoint
CREATE INDEX `entretien_maison_idx` ON `entretien` (`maison_id`);--> statement-breakpoint
CREATE INDEX `entretien_echeance_idx` ON `entretien` (`echeance`);--> statement-breakpoint
CREATE TABLE `__new_realisation` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text,
	`maison_id` text,
	`entretien_id` text,
	`date` text NOT NULL,
	`titre` text NOT NULL,
	`note` text,
	`cout` real,
	`prestataire_id` text,
	`passee` integer DEFAULT false NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maison_id`) REFERENCES `maison`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entretien_id`) REFERENCES `entretien`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prestataire_id`) REFERENCES `prestataire`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_realisation`("id", "element_id", "maison_id", "entretien_id", "date", "titre", "note", "cout", "prestataire_id", "passee", "cree_le", "cree_par", "modifie_par", "modifie_le") SELECT "id", "element_id", NULL, "entretien_id", "date", "titre", "note", "cout", "prestataire_id", "passee", "cree_le", "cree_par", "modifie_par", "modifie_le" FROM `realisation`;--> statement-breakpoint
DROP TABLE `realisation`;--> statement-breakpoint
ALTER TABLE `__new_realisation` RENAME TO `realisation`;--> statement-breakpoint
CREATE INDEX `realisation_element_idx` ON `realisation` (`element_id`);--> statement-breakpoint
CREATE INDEX `realisation_date_idx` ON `realisation` (`date`);--> statement-breakpoint
CREATE INDEX `realisation_maison_idx` ON `realisation` (`maison_id`);--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-poubelle-verte', 'Sortir la poubelle verte', 'Routines', 'routine', 1, 'semaine', 0, 'La veille du ramassage. Rentrer le bac une fois vidé.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-poubelle-jaune', 'Sortir la poubelle jaune', 'Routines', 'routine', 2, 'semaine', 0, 'Emballages et papiers, la veille du ramassage.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-arroser-plantes', 'Arroser les plantes', 'Routines', 'routine', 1, 'semaine', 0, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-changer-draps', 'Changer les draps', 'Routines', 'routine', 2, 'semaine', 0, NULL);
