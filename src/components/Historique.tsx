import { useState } from "react";
import { ActionIcon, Anchor, Badge, Button, Card, Group, Menu, Stack, Text, Timeline, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconCheck, IconDots, IconHistory, IconPaperclip, IconPencil, IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { supprimerRealisation } from "../data/realisations";
import type { Document, Realisation } from "../db/schema";
import { dateLisible, euros } from "../lib/dates";
import { ecrire } from "../lib/query";
import { Apercu } from "./Documents";
import { ModalRealisation, type Cible } from "./ModalRealisation";

export type LigneHistorique = Realisation & { prestataireNom: string | null; documents: Document[] };

/** Ce qui a été fait sur l'élément, du plus récent au plus ancien : entretiens réalisés et interventions. */
export function Historique({ elementId, historique }: { elementId: string; historique: LigneHistorique[] }) {
  // On garde l'identifiant : la ligne affichée dans la fenêtre suit les données (pièces jointes retirées…).
  const [edition, setEdition] = useState<string | "intervention" | null>(null);
  const [apercu, setApercu] = useState<Document | null>(null);
  const enEdition = historique.find((r) => r.id === edition);
  const cible: Cible | null = edition === "intervention" ? { mode: "intervention" } : enEdition ? { mode: "edition", realisation: enEdition } : null;
  const total = historique.reduce((t, r) => t + (r.cout ?? 0), 0);

  const supprimer = (r: LigneHistorique) =>
    modals.openConfirmModal({
      title: `Supprimer « ${r.titre} » du ${dateLisible(r.date)} ?`,
      children: (
        <Text size="sm">
          {r.documents.length ? `Ses ${r.documents.length} document(s) seront aussi supprimés. ` : ""}
          {r.entretienId ? "L'échéance de l'entretien ne change pas." : ""}
        </Text>
      ),
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerRealisation(r.id)),
    });

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconHistory size={18} />
          <Title order={4}>Historique</Title>
          {total > 0 && (
            <Text size="sm" c="dimmed">
              · {euros(total)} au total
            </Text>
          )}
        </Group>
        <Button size="xs" variant="default" leftSection={<IconPlus size={16} />} onClick={() => setEdition("intervention")}>
          Intervention
        </Button>
      </Group>

      {historique.length === 0 ? (
        <Text size="sm" c="dimmed" py="md" ta="center">
          Les entretiens faits s'inscrivent ici. Une panne, une réparation ? Consignez-la avec sa facture.
        </Text>
      ) : (
        <Timeline bulletSize={22} lineWidth={2} color="brique" active={historique.length}>
          {historique.map((r) => (
            <Timeline.Item
              key={r.id}
              bullet={r.entretienId ? <IconCheck size={12} /> : <IconTool size={12} />}
              title={
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap={6}>
                    <Text fw={600} size="sm">
                      {r.titre}
                    </Text>
                    {!r.entretienId && (
                      <Badge size="xs" variant="light" color="gray">
                        Intervention
                      </Badge>
                    )}
                  </Group>
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Actions">
                        <IconDots size={14} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition(r.id)}>
                        Modifier, joindre un document
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => supprimer(r)}>
                        Supprimer
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              }
            >
              <Text size="xs" c="dimmed">
                {[dateLisible(r.date), r.prestataireNom, r.cout != null && euros(r.cout)].filter(Boolean).join(" · ")}
              </Text>
              {r.note && (
                <Text size="sm" mt={4} style={{ whiteSpace: "pre-line" }}>
                  {r.note}
                </Text>
              )}
              {r.documents.length > 0 && (
                <Stack gap={2} mt={4}>
                  {r.documents.map((d) => (
                    <Anchor key={d.id} component="button" type="button" size="xs" onClick={() => setApercu(d)} style={{ textAlign: "left" }}>
                      <Group gap={4} wrap="nowrap">
                        <IconPaperclip size={12} />
                        {d.nom}
                      </Group>
                    </Anchor>
                  ))}
                </Stack>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}

      <ModalRealisation elementId={elementId} cible={cible} onClose={() => setEdition(null)} />
      <Apercu doc={apercu} onClose={() => setApercu(null)} />
    </Card>
  );
}
