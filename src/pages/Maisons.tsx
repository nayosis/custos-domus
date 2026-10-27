import { useState } from "react";
import { ActionIcon, Badge, Button, Card, Group, Menu, Modal, SimpleGrid, Stack, Switch, Text, TextInput, Textarea, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArchive, IconDots, IconHome, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { creerMaison, listeMaisons, majMaison, supprimerMaison } from "../data/maisons";
import type { Maison } from "../db/schema";
import { ecrire } from "../lib/query";

type Saisie = { nom: string; adresse: string; notes: string; archivee: boolean };

/** Création (maison absente) ou modification d'une maison. */
function ModalMaison({ maison, opened, onClose }: { maison: Maison | null; opened: boolean; onClose: () => void }) {
  const [v, setV] = useState<Saisie>({ nom: "", adresse: "", notes: "", archivee: false });
  const [cle, setCle] = useState<string | null>(null);
  // Nouvelle ouverture : on repart de la maison (ou d'un formulaire vide).
  const ouverture = opened ? (maison?.id ?? "nouvelle") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened) setV({ nom: maison?.nom ?? "", adresse: maison?.adresse ?? "", notes: maison?.notes ?? "", archivee: maison?.archivee ?? false });
  }
  const enregistrer = async () => {
    const ok = await ecrire<unknown>(() =>
      maison ? majMaison(maison.id, { nom: v.nom.trim(), adresse: v.adresse || null, notes: v.notes || null, archivee: v.archivee }, maison.modifieLe) : creerMaison(v),
    );
    if (ok !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={maison ? "Modifier la maison" : "Nouvelle maison"}>
      <Stack>
        <TextInput label="Nom" placeholder="Maison, Location rue des Lilas…" required value={v.nom} onChange={(e) => setV({ ...v, nom: e.currentTarget.value })} data-autofocus />
        <Textarea label="Adresse" autosize minRows={2} value={v.adresse} onChange={(e) => setV({ ...v, adresse: e.currentTarget.value })} />
        <Textarea label="Notes" autosize minRows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.currentTarget.value })} />
        {maison && (
          <Switch
            label="Archivée (vendue, plus suivie : aucune alerte)"
            checked={v.archivee}
            onChange={(e) => setV({ ...v, archivee: e.currentTarget.checked })}
          />
        )}
        <Button onClick={enregistrer} disabled={!v.nom.trim()}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

export function Maisons() {
  const { data: maisons = [] } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const [edition, setEdition] = useState<{ maison: Maison | null } | null>(null);

  const supprimer = (m: Maison) =>
    modals.openConfirmModal({
      title: `Supprimer « ${m.nom} » ?`,
      children: <Text size="sm">Tous ses éléments, entretiens, historique et documents seront supprimés. Pour la garder sans alertes, archivez-la plutôt.</Text>,
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerMaison(m.id)),
    });

  return (
    <Stack p="lg" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Maisons</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEdition({ maison: null })}>
          Nouvelle maison
        </Button>
      </Group>

      {maisons.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconHome size={40} color="var(--mantine-color-brique-5)" />
            <Text fw={600}>Aucune maison pour l'instant</Text>
            <Text size="sm" c="dimmed" ta="center">
              Commencez par la vôtre ; vous y ajouterez ensuite ses équipements et leurs entretiens.
            </Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {maisons.map((m) => (
            <Card key={m.id} withBorder className="tuile" opacity={m.archivee ? 0.6 : 1}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap">
                  <IconHome size={22} color="var(--mantine-color-brique-6)" />
                  <div>
                    <Text fw={600}>{m.nom}</Text>
                    {m.adresse && (
                      <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-line" }}>
                        {m.adresse}
                      </Text>
                    )}
                  </div>
                </Group>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="Actions">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition({ maison: m })}>
                      Modifier
                    </Menu.Item>
                    <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => ecrire(() => majMaison(m.id, { archivee: !m.archivee }, m.modifieLe))}>
                      {m.archivee ? "Désarchiver" : "Archiver"}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => supprimer(m)}>
                      Supprimer
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              {m.archivee && (
                <Badge mt="sm" color="gray" variant="light">
                  Archivée
                </Badge>
              )}
            </Card>
          ))}
        </SimpleGrid>
      )}

      <ModalMaison maison={edition?.maison ?? null} opened={!!edition} onClose={() => setEdition(null)} />
    </Stack>
  );
}
