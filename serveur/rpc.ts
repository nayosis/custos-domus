/*
 * Fonctions métier appelables par le navigateur : POST /api/rpc/:nom { args }.
 * Ce sont les fonctions exportées de src/data/ (le navigateur en reçoit des talons, cf. vite.config.ts).
 * Tout compte connecté peut les appeler ; seules les écritures sont journalisées et diffusées.
 */
import * as documents from "../src/data/documents";
import * as elements from "../src/data/elements";
import * as entretiens from "../src/data/entretiens";
import * as maisons from "../src/data/maisons";
import * as tableauDeBord from "../src/data/tableauDeBord";
import * as prestataires from "../src/data/prestataires";
import * as realisations from "../src/data/realisations";

/** Modules exposés (même liste que le plugin Vite qui génère les talons). */
export const MODULES_RPC = { tableauDeBord, maisons, elements, entretiens, realisations, prestataires, documents };

export type Droit = "lecture" | "ecriture";

/** Fonctions qui ne modifient rien. Toute autre fonction exposée est une écriture. */
const LECTURE = new Set(["listeMaisons", "listeElements", "ficheElement", "listePrestataires", "listeModeles", "tableauDeBord"]);

type Fonction = (...args: unknown[]) => unknown;

export const FONCTIONS = new Map<string, { fn: Fonction; droit: Droit }>();
for (const [module, contenu] of Object.entries(MODULES_RPC)) {
  for (const [nom, valeur] of Object.entries(contenu)) {
    if (typeof valeur !== "function") continue;
    if (FONCTIONS.has(nom)) throw new Error(`Fonction RPC en double : ${nom} (${module})`);
    FONCTIONS.set(nom, { fn: valeur as Fonction, droit: LECTURE.has(nom) ? "lecture" : "ecriture" });
  }
}
for (const nom of LECTURE) if (!FONCTIONS.has(nom)) throw new Error(`Fonction de lecture inconnue : ${nom}`);

/** Exécute une fonction RPC (droits déjà vérifiés par l'appelant). */
export async function executerRpc(nom: string, args: unknown[]) {
  const f = FONCTIONS.get(nom);
  if (!f) throw new Error(`Fonction inconnue : ${nom}`);
  // Certaines fonctions renvoient une requête Drizzle (« thenable ») : await l'exécute.
  const resultat = await f.fn(...args);
  return resultat === undefined ? null : resultat;
}
