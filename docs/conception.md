# Conception

Décisions prises au cadrage (octobre 2026). Même socle technique que Tabularium Maiorum (Bun, Elysia, SQLite, Drizzle,
React, Mantine, TanStack) ; patte graphique chaleureuse (terre cuite, crème, sable), distincte du vert de Tabularium.

## Modèle

```
Maison ─┬─ Élément ─┬─ Entretien     (à venir : récurrent ou ponctuel)
        │           ├─ Réalisation   (historique : entretien fait, réparation consignée)
        │           └─ Document      (facture, garantie, rapport, notice, photo)
Prestataire ── lié aux entretiens et aux réalisations
Modèle d'entretien ── bibliothèque appliquée en un clic à un élément
```

- **Maison** = foyer. Un bien personnel (PC…) est rattaché à une maison comme les autres éléments.
- **Élément** : un seul modèle pour les équipements (fosse septique, PAC) et les achats (électroménager, PC).
  Emplacement en texte libre (pas de pièces). Date de mise en service distincte de la date d'achat (garantie).
  Remplacer un équipement : l'ancien est archivé avec son historique (`remplace_par`), le nouveau repart de zéro.
- **Chose à faire** (table `entretien`) : trois réglages indépendants (migration 0007, qui remplace la « nature »).
  - **Tâche ou routine** : sans intervalle, une tâche (close une fois faite) ; avec un intervalle en jours, semaines,
    mois ou années, une routine (elle revient).
  - **Qui s'en charge** : nous, un prestataire (`prestataire_id`) ou les enfants (`points`, mission) ; l'un ou l'autre,
    déduit des colonnes (`quiDe`). Confier aux enfants retire le prestataire ; choisir un prestataire retire la mission.
  - **Prendre rendez-vous d'abord** (`avec_rdv`) : étape « rendez-vous pris » en plus. Cochée d'office quand on choisit
    un prestataire, possible sans (contrôle technique).
- **Réalisation** : note libre, coût, prestataire, plusieurs documents. Sans entretien = intervention ponctuelle
  consignée après coup (réparation).

## Règles

- **Prochaine échéance** à la réalisation d'un entretien récurrent :
  - ancrage `realisation` (par défaut) : date réelle + intervalle ;
  - ancrage `fixe` : échéance précédente + intervalle.
- **Création** : on peut saisir une « dernière réalisation » pour que la première échéance soit juste.
- **Fenêtre d'alerte** : s'ouvre à échéance − délai. Délais par défaut : avec rendez-vous 6 semaines ; ce qui revient
  chaque jour ou chaque semaine, le jour même ; sinon 1 semaine. Modifiables par chose à faire.
- **Ancrage par défaut** : `fixe` pour ce qui revient chaque jour ou semaine (la poubelle du mercredi), sinon
  `realisation`.
- **« Fait »** : en un geste (date du jour) quand c'est nous ou les enfants sans rendez-vous ; sinon le formulaire
  (date, coût, prestataire, facture).
- **Flux d'un rendez-vous** : à prendre → rdv pris (date, prestataire) → fait. Rappel la veille du rendez-vous.
- **Relance** chaque semaine tant qu'un entretien de la fenêtre n'est ni fait ni « rdv pris ».
- **Garanties** : alerte un mois avant la fin.
- **Maison ou élément archivés** : plus aucune alerte.

## Rappels

- Canaux optionnels, choisis par chaque utilisateur : e-mail (API Mailjet ou SMTP générique, réglés par l'admin dans
  l'application), notification push de la PWA, flux iCal en lecture seule (URL secrète par utilisateur). ntfy plus tard.
- Vérification quotidienne à 8 h ; récapitulatif le lundi, plus alertes individuelles (retard, rendez-vous du lendemain).

## Comptes

- Rôles **écriture** et **admin**, globaux (pas de rôle lecture, pas de droits par maison, pas d'accès locataire).
- Super admin défini dans `.env` ; invitations et réinitialisations par lien à usage unique (comme Tabularium).

## Plan de la V1

1. Socle (fait) : infrastructure reprise de Tabularium, comptes, sauvegarde, maisons, thème.
2. Éléments, prestataires, documents (fait) : envoi, aperçu PDF et images, photo depuis le téléphone, type deviné.
3. Entretiens et réalisations (fait) : flux tâche et rendez-vous, réparations, bibliothèque de 21 modèles (migration 0001), historique avec pièces jointes, remplacement.
4. Tableau de bord (fait) : retard, à prévoir, rendez-vous, prochainement (3 mois), garanties, dernières interventions, dépenses de l'année ; filtre maison.
5. Rappels (fait) : tournée quotidienne à 8 h (jours manqués rattrapés, une semaine au plus), e-mail (Mailjet ou SMTP, réglé par un admin), push PWA (service worker `public/sw.js`, clés VAPID créées au premier besoin), flux iCal par lien secret. Réglages et préférences dans comptes.db.
6. Sauvegarde automatique (fait) : chaque nuit à partir de 3 h dans `data/sauvegardes` (14 conservées, `CUSTOS_SAUVEGARDES_CONSERVEES`), même ZIP que la sauvegarde téléchargée ; liste, téléchargement et restauration depuis la page Sauvegarde ; fichiers orphelins effacés au bout de 7 jours.
7. Publication (fait) : dépôt `nayosis/custos-domus`, image ghcr.io, déploiement sur Pikachu (`maison.nayosis.wedogeek.xyz`).

V2 : ntfy, OCR facultatif des factures (désactivé par défaut : les documents sortiraient du serveur), mesures
structurées (relevés de la PAC), entretiens conditionnels ou saisonniers.

## Au-delà de l'entretien (après la V1)

Les demandes après la mise en service dépassent « l'entretien d'un élément » : sortir les poubelles (une routine),
les voitures, et les enfants à qui confier des choses. Décisions prises (novembre 2026) :

1. Petites briques (fait) : intervalle en **semaines** ; **passer cette fois** (réalisation `passee`, motif dans la
   note, hors dépenses et dernières interventions ; la suivante part de l'échéance passée, sans laisser d'échéances
   dépassées) ; **reporter** une seule échéance (`echeance_initiale` garde la date d'origine : le rythme ne glisse
   pas) ; **heure et durée** des rendez-vous (facultatives ; créneau UTC et alarme 1 h avant dans l'agenda) ;
   **lien d'agenda de la famille** (un seul, réglage `jeton_ical_famille`, régénéré par un admin).
2. « À faire » et routines (fait) : page **À faire** par maison (`/a-faire`, dans la barre du bas à la place des
   prestataires) ; une chose à faire ou une intervention peut être rattachée à la maison sans élément (`maison_id`,
   l'un ou l'autre ; migration 0003, qui reconstruit `entretien` et `realisation`) ; nature **routine** (ni coût ni
   prestataire, « Fait » en un geste à la date du jour, à date fixe, rappel le jour même, absente de
   « Prochainement ») ; modèles « Routines » (poubelles verte et jaune, arrosage, draps). Les poubelles se notent la
   veille de la collecte : pas d'heure de rappel spécifique. Les migrations s'exécutent clés étrangères suspendues
   (vérifiées à la fin de chacune).
3. Véhicules (fait) : un véhicule est un élément de type `vehicule` **sans maison** (migration 0004, qui reconstruit
   `element`) : il reprend documents, historique et choses à faire ; page **Véhicules** (`/vehicules`, dans « Plus »)
   et fiche avec immatriculation et carte **Compteur**. Table `releve` (le compteur ne recule pas ; le kilométrage noté
   sur une intervention devient un relevé). Entretiens « tous les N ans **ou** tous les N km, au premier atteint »
   (`intervalle_km`, `km_echeance`, `echeance_temps`) : `echeance` est la plus proche de l'échéance au temps et de la
   date estimée au rythme des relevés de l'année (deux relevés à deux semaines d'écart au moins) ; sans estimation ni
   échéance au temps, dans un an. Relevé demandé le 1er du mois, relancé le 4 si rien depuis le 1er ; la notification
   ouvre la saisie (`/elements/:id?releve=1`). Tableau de bord : les véhicules apparaissent sur « toutes les
   maisons ». Modèles : révision (15 000 km), courroie, liquide de frein, pneus. Pas d'assurance.
4. Famille (fait) : profils **enfant** (table `enfant`, migration 0005) connectés par **prénom et code PIN** (4 à 8
   chiffres, haché ; 10 codes faux de suite bloquent le profil jusqu'à un nouveau code ; 10 échecs par IP en 15 min)
   sur `/enfant`, avec un cookie à part (`custos_enfant`, sessions dans comptes.db) : 30 jours sur leur téléphone, ou
   15 minutes sans rien faire (tablette partagée, prénoms retenus sur l'appareil). Un enfant n'a accès qu'à
   `/api/enfant/*`, jamais aux fonctions RPC. **Mission** = une chose à faire avec des points (10 par défaut) et un ou
   plusieurs enfants (`mission_tour`) : un seul = la sienne (`entretien.enfant_id`) ; plusieurs = **partagée**
   (`enfant_id` vide) : chacun la voit, le premier qui la fait gagne les points, elle est faite pour tous. L'enfant coche « C'est fait » au plus deux jours
   avant l'échéance, une fois par jour (tous enfants confondus), seul ou **avec d'autres enfants** : les points sont alors partagés (à parts égales
   par défaut, ressaisissables ; table `part_mission`, migration 0006, la part de chacun) : réalisation à valider (`validation`, `points`, état d'avant gardé), push aux
   parents. Validée par n'importe quel parent, d'office au bout de 48 h ; **refusée** : aucun point, la mission revient
   comme avant si rien n'a été fait depuis. Un parent qui coche « Fait » ne donne de points à personne. Objectif de
   points par semaine (du lundi au dimanche) ; **récompenses** définies par les parents, demandées par l'enfant (points
   réservés), accordées ou refusées (les points reviennent). Page **Famille** (`/famille`, dans « Plus », pastille quand
   quelque chose attend). Codes PIN masqués dans le journal. Page **Aide** (`/aide`, dans le menu) : les trois réglages d'une chose à faire et ce qui en découle. **Notifications** sur le téléphone de l'enfant (table `abonnement_push_enfant`
   dans comptes.db) : ses missions du jour et en retard à la tournée de 8 h, mission validée ou refusée, récompense
   accordée ou refusée ; retirées quand il quitte l'appareil (« Quitter »), quand le profil est désactivé ou supprimé. Ton sobre, pas enfantin.
