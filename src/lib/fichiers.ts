import { ErreurServeur, ID_CLIENT } from "./rpc";

export type FichierEnvoye = { fichier: string; mime: string; taille: number; nom: string };

/** Envoie un fichier au serveur ; il est ensuite rattaché par creerDocument. */
export async function envoyerFichier(fichier: File): Promise<FichierEnvoye> {
  const f = new FormData();
  f.append("fichier", fichier);
  const r = await fetch("/api/fichiers", { method: "POST", body: f, headers: { "x-custos": "1", "x-client": ID_CLIENT }, credentials: "same-origin" });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurServeur(corps.erreur ?? `Erreur ${r.status}`, r.status);
  return corps as FichierEnvoye;
}

export const urlFichier = (fichier: string) => `/api/fichiers/${fichier}`;
