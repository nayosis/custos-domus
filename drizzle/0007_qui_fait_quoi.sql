ALTER TABLE `entretien` ADD `avec_rdv` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `modele_entretien` ADD `avec_rdv` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- La nature disparaît : « rendez-vous » devient la case « prendre rendez-vous d'abord » ; tâche ou routine se lit à l'intervalle.
UPDATE `entretien` SET `avec_rdv` = 1 WHERE `nature` = 'rdv';--> statement-breakpoint
UPDATE `modele_entretien` SET `avec_rdv` = 1 WHERE `nature` = 'rdv';--> statement-breakpoint
-- Qui s'en charge : un seul choix. Confiée aux enfants, elle n'a plus de prestataire (l'historique garde le sien).
UPDATE `entretien` SET `prestataire_id` = NULL WHERE `points` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `entretien` DROP COLUMN `nature`;--> statement-breakpoint
ALTER TABLE `modele_entretien` DROP COLUMN `nature`;
