import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DOSSIER_FICHIERS } from "./config";

/** Nom de fichier choisi par le serveur (UUID + extension) : jamais de chemin. */
export const nomValide = (nom: string) => /^[a-zA-Z0-9-]+\.[a-z0-9]{2,5}$/.test(nom);

export const cheminFichier = (nom: string) => {
  if (!nomValide(nom)) throw new Error(`Nom de fichier invalide : ${nom}`);
  return join(DOSSIER_FICHIERS, nom);
};

/** Supprime un fichier du disque (appelé par les fonctions de suppression de src/data/). */
export async function supprimerFichier(nom: string) {
  const chemin = cheminFichier(nom);
  if (existsSync(chemin)) unlinkSync(chemin);
}

/** Fichiers sur le disque des documents supprimés avec leur fiche (élément, maison). */
export async function supprimerFichiers(noms: string[]) {
  for (const nom of noms) if (nomValide(nom)) await supprimerFichier(nom);
}
