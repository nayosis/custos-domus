import { creerApp } from "./app";
import { ouvrirBase } from "./base";
import { installerSuperAdmin, ouvrirComptes } from "./comptes";
import { BASE_COMPTES, BASE_DONNEES, DOSSIER_DONNEES, DOSSIER_MIGRATIONS, FUSEAU, PORT, preparerDossiers } from "./config";
import { planifierRappels } from "./rappels";
import { planifierSauvegardes } from "./sauvegardeAuto";
import { definirFuseau } from "../src/lib/dates";

definirFuseau(FUSEAU);
preparerDossiers();
const { appliquees } = ouvrirBase(BASE_DONNEES, DOSSIER_MIGRATIONS);
if (appliquees.length) console.log(`Migrations appliquées : ${appliquees.join(", ")}`);

ouvrirComptes(BASE_COMPTES);
await installerSuperAdmin(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_MOT_DE_PASSE);

creerApp().listen(PORT);
console.log(`Custos Domus : http://localhost:${PORT} (données : ${DOSSIER_DONNEES})`);

// Rappels : tournée chaque jour à 8 h (fuseau de l'installation).
planifierRappels();
// Sauvegarde complète chaque nuit dans data/sauvegardes.
planifierSauvegardes();
