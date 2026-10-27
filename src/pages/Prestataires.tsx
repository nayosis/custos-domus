import { useState } from "react";
import { ActionIcon, Anchor, Button, Card, Group, Menu, Modal, SimpleGrid, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconDots, IconMail, IconPencil, IconPhone, IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { creerPrestataire, listePrestataires, majPrestataire, supprimerPrestataire } from "../data/prestataires";
import type { Prestataire } from "../db/schema";
import { ecrire } from "../lib/query";

type Saisie = { nom: string; metier: string; telephone: string; email: string; notes: string };

/** Création (prestataire absent) ou modification d'un prestataire. */
function ModalPrestataire({ prestataire, opened, onClose }: { prestataire: Prestataire | null; opened: boolean; onClose: () => void }) {
  const [v, setV] = useState<Saisie>({ nom: "", metier: "", telephone: "", email: "", notes: "" });
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (prestataire?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened)
      setV({
        nom: prestataire?.nom ?? "",
        metier: prestataire?.metier ?? "",
        telephone: prestataire?.telephone ?? "",
        email: prestataire?.email ?? "",
        notes: prestataire?.notes ?? "",
      });
  }
  const champ = (k: keyof Saisie) => ({ value: v[k], onChange: (e: { currentTarget: { value: string } }) => setV({ ...v, [k]: e.currentTarget.value }) });
  const enregistrer = async () => {
    const ok = await ecrire<unknown>(() => (prestataire ? majPrestataire(prestataire.id, v, prestataire.modifieLe) : creerPrestataire(v)));
    if (ok !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={prestataire ? "Modifier le prestataire" : "Nouveau prestataire"}>
      <Stack>
        <TextInput label="Nom" placeholder="Entreprise ou artisan" required {...champ("nom")} data-autofocus />
        <TextInput label="Métier" placeholder="Chauffagiste, vidangeur, SAV Bosch…" {...champ("metier")} />
        <TextInput label="Téléphone" type="tel" {...champ("telephone")} />
        <TextInput label="E-mail" type="email" {...champ("email")} />
        <Textarea label="Notes" placeholder="Contrat d'entretien, délai habituel pour un rendez-vous…" autosize minRows={2} {...champ("notes")} />
        <Button onClick={enregistrer} disabled={!v.nom.trim()}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

export function Prestataires() {
  const { data: prestataires = [] } = useQuery({ queryKey: ["prestataires"], queryFn: () => listePrestataires() });
  const [edition, setEdition] = useState<{ prestataire: Prestataire | null } | null>(null);

  const supprimer = (p: Prestataire) =>
    modals.openConfirmModal({
      title: `Supprimer « ${p.nom} » ?`,
      children: <Text size="sm">Les entretiens et l'historique qui le citent sont conservés, sans prestataire.</Text>,
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: () => ecrire(() => supprimerPrestataire(p.id)),
    });

  return (
    <Stack p="lg" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Prestataires</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEdition({ prestataire: null })}>
          Nouveau prestataire
        </Button>
      </Group>

      {prestataires.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconTool size={40} color="var(--mantine-color-brique-5)" />
            <Text fw={600}>Aucun prestataire pour l'instant</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Le chauffagiste, l'entreprise de vidange, le SAV d'un appareil : leurs coordonnées à portée de main au moment de prendre rendez-vous.
            </Text>
          </Stack>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {prestataires.map((p) => (
            <Card key={p.id} withBorder>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600}>{p.nom}</Text>
                  {p.metier && (
                    <Text size="sm" c="dimmed">
                      {p.metier}
                    </Text>
                  )}
                </div>
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label="Actions">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition({ prestataire: p })}>
                      Modifier
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => supprimer(p)}>
                      Supprimer
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              {(p.telephone || p.email) && (
                <Stack gap={4} mt="sm">
                  {p.telephone && (
                    <Anchor href={`tel:${p.telephone.replace(/\s/g, "")}`} size="sm">
                      <Group gap={6} wrap="nowrap">
                        <IconPhone size={14} />
                        {p.telephone}
                      </Group>
                    </Anchor>
                  )}
                  {p.email && (
                    <Anchor href={`mailto:${p.email}`} size="sm" truncate>
                      <Group gap={6} wrap="nowrap">
                        <IconMail size={14} />
                        {p.email}
                      </Group>
                    </Anchor>
                  )}
                </Stack>
              )}
              {p.notes && (
                <Text size="sm" c="dimmed" mt="sm" style={{ whiteSpace: "pre-line" }}>
                  {p.notes}
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
      )}

      <ModalPrestataire prestataire={edition?.prestataire ?? null} opened={!!edition} onClose={() => setEdition(null)} />
    </Stack>
  );
}
