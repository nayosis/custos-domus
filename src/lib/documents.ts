/** Types de documents rattachés à un élément ou à une réalisation (libellés affichés). */
export const TYPES_DOCUMENT = {
  facture: "Facture",
  garantie: "Garantie",
  rapport: "Rapport",
  notice: "Notice",
  photo: "Photo",
  devis: "Devis",
  autre: "Autre",
} as const;
export type TypeDocument = keyof typeof TYPES_DOCUMENT;

export const estTypeDocument = (t: unknown): t is TypeDocument => typeof t === "string" && t in TYPES_DOCUMENT;

/** Type deviné d'après le fichier envoyé (modifiable ensuite). */
export function typeDevine(nom: string, mime: string): TypeDocument {
  const n = nom.toLowerCase();
  for (const t of ["facture", "garantie", "rapport", "notice", "devis"] as const) if (n.includes(t)) return t;
  if (n.includes("ticket")) return "facture";
  return mime.startsWith("image/") ? "photo" : "autre";
}

/** Extension (choisie par le serveur à l'envoi) → type MIME servi. */
export const MIME_PAR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

/** Taille lisible : « 1,2 Mo ». */
export function tailleLisible(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 ** 2) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 ** 2).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
