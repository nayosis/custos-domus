<p align="center">
  <img src="public/icone.svg" alt="" width="96" height="96">
</p>

<h1 align="center">Custos Domus</h1>

<p align="center">
  <em>Le gardien de la maison</em> — logiciel libre de suivi de l'entretien de ses maisons.
</p>

Une fosse septique à vidanger tous les quatre ans, une pompe de relevage à nettoyer chaque année, la pompe à chaleur
dont l'entretien annuel se réserve des semaines à l'avance, la facture du lave-linge qu'on ne retrouve jamais le jour où
il tombe en panne sous garantie… Custos Domus garde tout cela pour vous, et vous prévient à temps.

## Ce qu'on y trouve

- **Maisons** : la sienne, une maison mise en location, chacune avec ses équipements.
- **Éléments** : équipements de la maison et appareils achetés (marque, modèle, n° de série, achat, mise en service,
  fin de garantie), avec leurs factures, garanties et notices (PDF, photos).
- **Entretiens** : périodiques (tous les ans, tous les 4 ans…) ou ponctuels ; une *tâche* à faire soi-même ou un
  *rendez-vous* à prendre (à prendre → pris le… → fait).
- **Historique** : chaque entretien réalisé et chaque réparation, avec note, coût, intervenant et documents.
- **Tableau de bord** : en retard, à planifier, rendez-vous à venir, garanties qui expirent, coûts de l'année.
- **Rappels** : par e-mail, notification sur le téléphone, et dans son agenda (flux iCal).
- **Comptes** : admin et écriture ; invitation par lien.

## Installer (Docker)

```bash
mkdir custos-domus && cd custos-domus
curl -O https://raw.githubusercontent.com/nayosis/custos-domus/main/docker-compose.yml
docker compose up -d
```

Puis ouvrir `http://<serveur>:3000` : le premier compte créé est l'administrateur principal. Réglages facultatifs : voir
[.env.exemple](.env.exemple) ; derrière un reverse proxy HTTPS, voir [docker/nginx-exemple.conf](docker/nginx-exemple.conf).

## Développement

```bash
bun install
cp .env.exemple .env      # puis choisir le super admin de développement
bun run dev               # interface : http://localhost:5173 (API sur le port 3210)
bun test
bun run type-check
bun run db:generate       # après modification de src/db/schema.ts → nouvelle migration dans drizzle/
```

Bun + Elysia + SQLite (Drizzle) côté serveur, React + Mantine côté interface. Le navigateur appelle les fonctions de
`src/data/` par leur nom (`POST /api/rpc/:fonction`) ; le plugin Vite les remplace par des appels réseau. Conception
détaillée : [docs/conception.md](docs/conception.md).

## Licence

[AGPL-3.0-or-later](LICENSE).
