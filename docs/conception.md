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
4. Tableau de bord : retard, à planifier, rendez-vous, garanties, dernières interventions, coûts de l'année ; filtre maison.
5. Rappels : tâche quotidienne, e-mail, push PWA, flux iCal.
6. Sauvegarde automatique chaque nuit dans `/data/sauvegardes` (14 conservées).
7. Publication : dépôt `nayosis/custos-domus`, image ghcr.io, déploiement sur Pikachu.

V2 : ntfy, OCR facultatif des factures (désactivé par défaut : les documents sortiraient du serveur), mesures
structurées (relevés de la PAC), entretiens conditionnels ou saisonniers.
