CREATE TABLE `part_mission` (
	`realisation_id` text NOT NULL,
	`enfant_id` text NOT NULL,
	`points` integer NOT NULL,
	PRIMARY KEY(`realisation_id`, `enfant_id`),
	FOREIGN KEY (`realisation_id`) REFERENCES `realisation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enfant_id`) REFERENCES `enfant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `part_mission_enfant_idx` ON `part_mission` (`enfant_id`);--> statement-breakpoint
-- Missions déjà faites : toute la part à celui qui l'a cochée.
INSERT INTO `part_mission` (`realisation_id`, `enfant_id`, `points`)
SELECT `id`, `enfant_id`, `points` FROM `realisation` WHERE `enfant_id` IS NOT NULL AND `points` IS NOT NULL;
