-- Véhicules : un élément de type « vehicule », sans maison (element reconstruit : maison_id facultatif),
-- relevés de compteur, entretiens « ou tous les N km », kilométrage des interventions.
CREATE TABLE `releve` (
	`id` text PRIMARY KEY NOT NULL,
	`element_id` text NOT NULL,
	`date` text NOT NULL,
	`km` integer NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`element_id`) REFERENCES `element`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `releve_element_idx` ON `releve` (`element_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_element` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'equipement' NOT NULL,
	`maison_id` text,
	`nom` text NOT NULL,
	`immatriculation` text,
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
INSERT INTO `__new_element`("id", "type", "maison_id", "nom", "immatriculation", "categorie", "emplacement", "marque", "modele", "numero_serie", "date_achat", "date_mise_en_service", "prix", "vendeur", "fin_garantie", "notes", "archive", "remplace_par", "cree_le", "cree_par", "modifie_par", "modifie_le") SELECT "id", 'equipement', "maison_id", "nom", NULL, "categorie", "emplacement", "marque", "modele", "numero_serie", "date_achat", "date_mise_en_service", "prix", "vendeur", "fin_garantie", "notes", "archive", "remplace_par", "cree_le", "cree_par", "modifie_par", "modifie_le" FROM `element`;--> statement-breakpoint
DROP TABLE `element`;--> statement-breakpoint
ALTER TABLE `__new_element` RENAME TO `element`;--> statement-breakpoint
CREATE INDEX `element_maison_idx` ON `element` (`maison_id`);--> statement-breakpoint
ALTER TABLE `entretien` ADD `intervalle_km` integer;--> statement-breakpoint
ALTER TABLE `entretien` ADD `km_echeance` integer;--> statement-breakpoint
ALTER TABLE `entretien` ADD `echeance_temps` text;--> statement-breakpoint
ALTER TABLE `modele_entretien` ADD `intervalle_km` integer;--> statement-breakpoint
ALTER TABLE `realisation` ADD `kilometrage` integer;--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `intervalle_km`, `delai_alerte_jours`, `description`) VALUES ('modele-courroie-distribution', 'Courroie de distribution', 'Véhicule', 'rdv', 6, 'an', 120000, 60, 'À changer avec la pompe à eau ; intervalle exact dans le carnet d''entretien.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `intervalle_km`, `delai_alerte_jours`, `description`) VALUES ('modele-liquide-frein', 'Liquide de frein', 'Véhicule', 'rdv', 2, 'an', NULL, 30, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `intervalle_km`, `delai_alerte_jours`, `description`) VALUES ('modele-pneus', 'Contrôle des pneus', 'Véhicule', 'tache', 6, 'mois', NULL, 7, 'Usure (témoin à 1,6 mm) et pression, roue de secours comprise.');
--> statement-breakpoint
UPDATE `modele_entretien` SET `description` = 'Obligatoire tous les 2 ans (le premier aux 4 ans du véhicule). Prendre rendez-vous un mois avant.' WHERE `id` = 'modele-controle-technique';
--> statement-breakpoint
UPDATE `modele_entretien` SET `intervalle_km` = 15000, `description` = 'Vidange, filtres et points de contrôle ; au premier atteint des deux, selon le carnet d''entretien (15 000 à 30 000 km).' WHERE `id` = 'modele-revision-vehicule';
