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
- **Entretien** : nature `tache` (à faire soi-même) ou `rdv` (à prendre). Intervalle en jours, mois ou années ;
  vide = ponctuel (clos une fois réalisé). Pas d'entretien saisonnier ni conditionnel en V1.
- **Réalisation** : note libre, coût, prestataire, plusieurs documents. Sans entretien = intervention ponctuelle
  consignée après coup (réparation).

## Règles

- **Prochaine échéance** à la réalisation d'un entretien récurrent :
  - ancrage `realisation` (par défaut) : date réelle + intervalle ;
  - ancrage `fixe` : échéance précédente + intervalle.
- **Création** : on peut saisir une « dernière réalisation » pour que la première échéance soit juste.
- **Fenêtre d'alerte** : s'ouvre à échéance − délai. Délais par défaut : rendez-vous 6 semaines, tâche 1 semaine ;
  modifiables par entretien.
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
3. Véhicules : rubrique à part (fiche, immatriculation, kilométrage) ; intervention rapide (moi ou un garage, prix
   approximatif, km, photo de facture) ; **relevé du compteur** demandé le 1er du mois (relance 3 jours après) ;
   entretiens au kilométrage « ou au temps, au premier atteint », date estimée d'après les relevés. Pas d'assurance.
4. Famille : profils **enfant** (16 et 13 ans ; la plus petite plus tard) connectés par code PIN, sur la tablette
   partagée ou leur téléphone, qui ne voient que leurs missions ; missions attribuées ou à tour de rôle ; points
   (10 par défaut, fixés par mission), validés par n'importe quel parent (automatiquement après 48 h) ; objectif
   individuel par semaine ; récompenses définies par les parents. Ton sobre, pas enfantin.
