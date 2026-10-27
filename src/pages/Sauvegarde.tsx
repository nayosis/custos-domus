import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, FileButton, Group, List, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconClockHour3, IconDatabaseExport, IconDatabaseImport, IconDownload, IconHistory, IconInfoCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { appelApi, ErreurServeur } from "../lib/rpc";
import { utilisateur } from "../lib/session";

type Compteurs = { maisons: number; elements: number; entretiens: number; realisations: number; documents: number };

export const formaterTaille = (octets: number) =>
  octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / 1024 / 1024).toFixed(octets < 100 * 1024 * 1024 ? 1 : 0)} Mo`;

function Chiffres({ c }: { c: Compteurs }) {
  return (
    <SimpleGrid cols={5} spacing="xs">
      {(
        [
          ["Maisons", c.maisons],
          ["Éléments", c.elements],
          ["Entretiens", c.entretiens],
          ["Interventions", c.realisations],
          ["Documents", c.documents],
        ] as const
      ).map(([l, n]) => (
        <Stack key={l} gap={0} align="center">
          <Text fw={700} size="lg">
            {n}
          </Text>
          <Text size="xs" c="dimmed">
            {l}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

type Automatiques = {
  sauvegardes: { nom: string; taille: number; le: string }[];
  derniere: { jour: string; le: string; nom?: string; erreur?: string; orphelins?: number } | null;
  conservees: number;
};

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Sauvegardes de chaque nuit, gardées sur le serveur : état de la dernière, liste, téléchargement, restauration. */
function SauvegardesAutomatiques({ onRestaurer }: { onRestaurer: (nom: string) => void }) {
  const moi = utilisateur();
  const { data, refetch } = useQuery({ queryKey: ["sauvegardes-auto"], queryFn: () => appelApi<Automatiques>("/api/sauvegarde/automatiques") });
  const [enCours, setEnCours] = useState(false);
  const maintenant = async () => {
    setEnCours(true);
    try {
      const s = await appelApi<{ nom: string; taille: number }>("/api/sauvegarde/automatiques", { corps: {} });
      notifications.show({ color: "green", message: `Sauvegarde faite (${formaterTaille(s.taille)}).` });
      await refetch();
    } catch (e) {
      notifications.show({ color: "red", title: "Sauvegarde impossible", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnCours(false);
    }
  };
  if (!data) return null;
  const { derniere } = data;
  return (
    <Paper withBorder p="md">
      <Stack>
        <Group justify="space-between">
          <Group gap="xs">
            <IconHistory size={20} />
            <Text fw={600}>Sauvegardes automatiques</Text>
          </Group>
          <Button size="xs" variant="default" loading={enCours} onClick={maintenant}>
            Sauvegarder maintenant
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          Chaque nuit vers 3 h, une sauvegarde complète est gardée sur le serveur (les {data.conservees} dernières). Elles sont sur le même disque que les données : recopiez
          régulièrement le dossier <code>data/sauvegardes</code> ailleurs (ou téléchargez-en une).
        </Text>
        {derniere?.erreur ? (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title={`Échec de la sauvegarde du ${quand(derniere.le)}`}>
            {derniere.erreur} — nouvel essai dans l'heure.
          </Alert>
        ) : derniere ? (
          <Group gap="xs">
            <Badge color="green" variant="light" leftSection={<IconClockHour3 size={12} />} style={{ textTransform: "none" }}>
              Dernière sauvegarde : {quand(derniere.le)}
            </Badge>
            {!!derniere.orphelins && (
              <Text size="xs" c="dimmed">
                {derniere.orphelins} fichier(s) orphelin(s) effacé(s)
              </Text>
            )}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            La première sauvegarde automatique se fera cette nuit.
          </Text>
        )}
        {data.sauvegardes.length > 0 && (
          <Table verticalSpacing={6} highlightOnHover>
            <Table.Tbody>
              {data.sauvegardes.map((s) => (
                <Table.Tr key={s.nom}>
                  <Table.Td fz="sm">{quand(s.le)}</Table.Td>
                  <Table.Td fz="sm" c="dimmed" ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formaterTaille(s.taille)}
                  </Table.Td>
                  <Table.Td w={1} style={{ whiteSpace: "nowrap" }}>
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      {moi?.super && (
                        <Button size="compact-xs" variant="subtle" color="red" onClick={() => onRestaurer(s.nom)}>
                          Restaurer
                        </Button>
                      )}
                      <Tooltip label="Télécharger">
                        <ActionIcon variant="subtle" color="gray" component="a" href={`/api/sauvegarde/automatiques/${s.nom}`} download aria-label={`Télécharger ${s.nom}`}>
                          <IconDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

/** Admins : télécharger une sauvegarde complète. Super admin : restaurer (y compris une sauvegarde d'une autre installation). */
export function Sauvegarde() {
  const moi = utilisateur();
  const { data, refetch } = useQuery({
    queryKey: ["sauvegarde-infos"],
    queryFn: () => appelApi<{ compteurs: Compteurs; taille: { base: number; fichiers: number } }>("/api/sauvegarde/infos"),
  });
  const [restauration, setRestauration] = useState(false);

  const restaurer = (fichier: File | string | null) => {
    if (!fichier) return;
    const libelle = typeof fichier === "string" ? `la sauvegarde automatique ${fichier}` : `${fichier.name} (${formaterTaille(fichier.size)})`;
    modals.openConfirmModal({
      title: "Remplacer toutes les données par cette sauvegarde ?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Toutes les données actuelles (maisons, éléments, entretiens, historique, documents…) seront remplacées par celles de <b>{libelle}</b>.
          </Text>
          <Text size="sm" c="dimmed">
            La base actuelle est gardée sur le serveur (donnees.db.avant-restauration). Les comptes ne changent pas. Pensez à télécharger une
            sauvegarde avant, par précaution.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Restaurer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        setRestauration(true);
        try {
          let r: Response;
          if (typeof fichier === "string") {
            r = await fetch(`/api/sauvegarde/automatiques/${fichier}/restaurer`, { method: "POST", headers: { "x-custos": "1" }, credentials: "same-origin" });
          } else {
            const f = new FormData();
            f.append("fichier", fichier);
            r = await fetch("/api/sauvegarde/restaurer", { method: "POST", body: f, headers: { "x-custos": "1" }, credentials: "same-origin" });
          }
          const corps = await r.json().catch(() => ({}));
          if (!r.ok) throw new ErreurServeur(corps.erreur ?? `Erreur ${r.status}`, r.status);
          const c = corps.installe as Compteurs;
          notifications.show({
            color: "brique",
            title: "Sauvegarde restaurée",
            message: `${c.maisons} maisons, ${c.elements} éléments, ${c.documents} documents. La page va se recharger.`,
          });
          setTimeout(() => location.assign("/"), 1500);
        } catch (e) {
          notifications.show({ color: "red", title: "Restauration impossible", message: e instanceof Error ? e.message : String(e) });
          setRestauration(false);
          refetch();
        }
      },
    });
  };

  return (
    <Stack p="lg" gap="lg" maw={900}>
      <Title order={2}>Sauvegarde</Title>

      <Paper withBorder p="md">
        <Stack>
          <Group gap="xs">
            <IconDatabaseExport size={20} />
            <Text fw={600}>Télécharger une sauvegarde</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Un fichier ZIP avec toute la base et tous les fichiers (factures, photos…)
            {data && ` (environ ${formaterTaille(data.taille.base + data.taille.fichiers)})`}. À garder en lieu sûr, chez vous ou sur un disque externe.
          </Text>
          {data && <Chiffres c={data.compteurs} />}
          <Group>
            <Button component="a" href="/api/sauvegarde" download leftSection={<IconDatabaseExport size={16} />}>
              Télécharger la sauvegarde
            </Button>
          </Group>
        </Stack>
      </Paper>

      <SauvegardesAutomatiques onRestaurer={restaurer} />

      {moi?.super ? (
        <Paper withBorder p="md">
          <Stack>
            <Group gap="xs">
              <IconDatabaseImport size={20} />
              <Text fw={600}>Restaurer une sauvegarde</Text>
            </Group>
            <List size="sm" spacing={4}>
              <List.Item>Remplace toutes les données par celles du ZIP (sauvegarde de cette installation ou d'une autre installation de Custos Domus).</List.Item>
              <List.Item>Les comptes et mots de passe ne changent pas.</List.Item>
              <List.Item>Pour changer de serveur : télécharger la sauvegarde sur l'ancien, puis la restaurer ici.</List.Item>
            </List>
            <Group>
              <FileButton onChange={restaurer} accept=".zip,application/zip">
                {(props) => (
                  <Button {...props} color="red" variant="light" loading={restauration} leftSection={<IconDatabaseImport size={16} />}>
                    Choisir une sauvegarde (.zip)…
                  </Button>
                )}
              </FileButton>
            </Group>
          </Stack>
        </Paper>
      ) : (
        <Alert color="gray" icon={<IconInfoCircle size={16} />}>
          Seul le super admin peut restaurer une sauvegarde.
        </Alert>
      )}
    </Stack>
  );
}
