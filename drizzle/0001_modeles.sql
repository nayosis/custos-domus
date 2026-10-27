-- Bibliothèque d'entretiens types (identifiants stables : une migration future peut les corriger).
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-fosse-septique', 'Vidange de la fosse septique', 'Eau et assainissement', 'rdv', 4, 'an', 42, 'Quand les boues atteignent la moitié du volume, en général tous les 4 ans. Par un vidangeur agréé : gardez le bordereau de suivi des matières de vidange.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-pompe-relevage', 'Nettoyage de la pompe de relevage', 'Eau et assainissement', 'tache', 1, 'an', 7, 'Couper l''alimentation, nettoyer la cuve, le flotteur et la crépine, puis vérifier que la pompe se déclenche.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-chauffe-eau-anode', 'Contrôle de l''anode et détartrage du chauffe-eau', 'Eau et assainissement', 'rdv', 2, 'an', 42, 'Prolonge nettement la durée de vie du ballon, surtout en eau calcaire.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-groupe-securite', 'Manœuvre du groupe de sécurité du chauffe-eau', 'Eau et assainissement', 'tache', 1, 'mois', 3, 'Ouvrir la soupape quelques secondes pour éviter qu''elle ne s''entartre.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-adoucisseur', 'Recharge en sel de l''adoucisseur', 'Eau et assainissement', 'tache', 2, 'mois', 7, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-pac', 'Entretien de la pompe à chaleur', 'Chauffage et climatisation', 'rdv', 2, 'an', 42, 'Obligatoire au moins tous les 2 ans pour les pompes à chaleur de 4 à 70 kW (décret 2020-912). Conservez l''attestation d''entretien.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-chaudiere', 'Entretien de la chaudière', 'Chauffage et climatisation', 'rdv', 1, 'an', 42, 'Obligatoire chaque année (gaz, fioul, bois). L''attestation est remise dans les 15 jours.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-ramonage', 'Ramonage du conduit de cheminée', 'Chauffage et climatisation', 'rdv', 1, 'an', 42, 'Obligatoire au moins une fois par an ; deux fois selon certains règlements sanitaires départementaux. Le certificat est souvent demandé par l''assureur.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-climatisation', 'Nettoyage des filtres de la climatisation', 'Chauffage et climatisation', 'tache', 3, 'mois', 7, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-radiateurs', 'Purge des radiateurs', 'Chauffage et climatisation', 'tache', 1, 'an', 14, 'Avant la saison de chauffe.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-vmc', 'Nettoyage des bouches de VMC', 'Autre', 'tache', 6, 'mois', 7, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-detecteurs-fumee', 'Test des détecteurs de fumée', 'Sécurité', 'tache', 1, 'mois', 3, 'Appuyer sur le bouton de test ; changer la pile si besoin.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-extincteur', 'Vérification de l''extincteur', 'Sécurité', 'rdv', 1, 'an', 42, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-gouttieres', 'Nettoyage des gouttières', 'Toiture et façade', 'tache', 1, 'an', 14, 'Après la chute des feuilles.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-toiture', 'Démoussage de la toiture', 'Toiture et façade', 'rdv', 5, 'an', 42, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-lave-vaisselle', 'Nettoyage du filtre du lave-vaisselle', 'Électroménager', 'tache', 1, 'mois', 3, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-lave-linge', 'Cycle d''entretien du lave-linge', 'Électroménager', 'tache', 1, 'mois', 3, 'Cycle à vide à haute température, nettoyage du joint et du filtre de vidange.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-ordinateur', 'Dépoussiérage de l''ordinateur', 'Informatique et multimédia', 'tache', 1, 'an', 7, 'Ventilateurs et radiateurs ; en profiter pour vérifier les sauvegardes.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-tondeuse', 'Révision de la tondeuse', 'Extérieur et jardin', 'tache', 1, 'an', 14, 'Vidange, filtre à air, affûtage de la lame : avant le printemps.');
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-controle-technique', 'Contrôle technique', 'Véhicule', 'rdv', 2, 'an', 42, NULL);
--> statement-breakpoint
INSERT INTO `modele_entretien` (`id`, `titre`, `categorie`, `nature`, `intervalle_valeur`, `intervalle_unite`, `delai_alerte_jours`, `description`) VALUES ('modele-revision-vehicule', 'Révision du véhicule', 'Véhicule', 'rdv', 1, 'an', 42, NULL);
