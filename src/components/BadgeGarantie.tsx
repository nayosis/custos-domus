import { Badge, Tooltip } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { dateLisible } from "../lib/dates";
import { etatGarantie } from "../lib/elements";

/** Garantie en cours (vert), qui expire dans le mois (orange), expirée (gris). Rien sans date de fin. */
export function BadgeGarantie({ fin, court = false }: { fin: string | null; court?: boolean }) {
  const g = etatGarantie(fin);
  if (g.etat === "aucune") return null;
  const date = dateLisible(g.fin);
  const [couleur, texte] =
    g.etat === "expiree"
      ? ["gray", court ? "Expirée" : `Garantie expirée le ${date}`]
      : g.etat === "bientot"
        ? ["orange", g.jours === 0 ? "Garantie : dernier jour" : `Garantie : encore ${g.jours} j`]
        : ["green", court ? `Garantie ${dateLisible(g.fin, { month: "short", year: "numeric" })}` : `Sous garantie jusqu'au ${date}`];
  return (
    <Tooltip label={`Fin de garantie : ${date}`} disabled={!court}>
      <Badge variant="light" color={couleur} leftSection={<IconShieldCheck size={12} />} style={{ textTransform: "none", flexShrink: 0 }}>
        {texte}
      </Badge>
    </Tooltip>
  );
}
