ALTER TABLE `entretien` ADD `echeance_initiale` text;--> statement-breakpoint
ALTER TABLE `entretien` ADD `heure_rdv` text;--> statement-breakpoint
ALTER TABLE `entretien` ADD `duree_rdv_minutes` integer;--> statement-breakpoint
ALTER TABLE `realisation` ADD `passee` integer DEFAULT false NOT NULL;