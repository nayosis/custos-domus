import { useMemo, useState } from "react";
import { Badge, Button, Card, Group, Select, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { IconPackage, IconPaperclip, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { listeElements } from "../data/elements";
import { listeMaisons } from "../data/maisons";
import { BadgeGarantie } from "../components/BadgeGarantie";
import { ModalElement } from "../components/ModalElement";
import { useEcran } from "../lib/ecran";
import { elementsRoute } from "../router";

type Ligne = Awaited<ReturnType<typeof listeElements>>[number];

/** « Daikin Altherma 3 » : marque et modèle, quand on les connaît. */
const sousTitre = (e: Ligne) => [e.marque, e.modele].filter(Boolean).join(" ");

/** Recherche sans accents ni majuscules, sur tout ce qui décrit l'élément. */
const normaliser = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const correspond = (e: Ligne, q: string) =>
  normaliser([e.nom, e.categorie, e.emplacement, e.marque, e.modele, e.numeroSerie, e.vendeur, e.maisonNom].filter(Boolean).join(" ")).includes(q);

function Vide({ filtre }: { filtre: boolean }) {
  return (
    <Card withBorder p="xl">
      <Stack align="center" gap="xs">
        <IconPackage size={40} color="var(--mantine-color-brique-5)" />
        <Text fw={600}>{filtre ? "Aucun élément ne correspond" : "Aucun élément pour l'instant"}</Text>
        {!filtre && (
          <Text size="sm" c="dimmed" ta="center" maw={420}>
            Ajoutez les équipements de la maison (fosse septique, pompe à chaleur…) et les appareils achetés, avec leurs factures et garanties.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function Elements() {
  const { maison: maisonFiltre } = elementsRoute.useSearch();
  const naviguer = useNavigate();
  const { telephone } = useEcran();
  const { data: elements = [] } = useQuery({ queryKey: ["elements"], queryFn: () => listeElements() });
  const { data: maisons = [] } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const [recherche, setRecherche] = useState("");
  const [archives, setArchives] = useState(false);
  const [creation, setCreation] = useState(false);

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    return elements.filter((e) => (archives || !e.archive) && (!maisonFiltre || e.maisonId === maisonFiltre) && (!q || correspond(e, q)));
  }, [elements, recherche, archives, maisonFiltre]);
  const plusieursMaisons = maisons.length > 1 && !maisonFiltre;
  const ouvrir = (id: string) => naviguer({ to: "/elements/$id", params: { id } });
  const choisirMaison = (m: string | null) => naviguer({ to: "/elements", search: m ? { maison: m } : {}, replace: true });

  return (
    <Stack p="lg" gap="lg">
      <Group justify="space-between">
        <Title order={2}>Éléments</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={() => setCreation(true)} disabled={!maisons.some((m) => !m.archivee)}>
          Nouvel élément
        </Button>
      </Group>

      <Group gap="sm" align="flex-end">
        <TextInput
          placeholder="Rechercher (nom, marque, n° de série…)"
          leftSection={<IconSearch size={16} />}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        {maisons.length > 1 && (
          <Select
            placeholder="Toutes les maisons"
            data={maisons.map((m) => ({ value: m.id, label: m.nom }))}
            value={maisonFiltre ?? null}
            onChange={choisirMaison}
            clearable
            w={220}
          />
        )}
        <Switch label="Archivés" checked={archives} onChange={(e) => setArchives(e.currentTarget.checked)} mb={8} />
      </Group>

      {maisons.length === 0 ? (
        <Card withBorder p="xl">
          <Text ta="center" c="dimmed">
            Créez d'abord une{" "}
            <Link to="/maisons" style={{ color: "var(--mantine-color-brique-6)" }}>
              maison
            </Link>
            .
          </Text>
        </Card>
      ) : visibles.length === 0 ? (
        <Vide filtre={elements.length > 0} />
      ) : telephone ? (
        <Stack gap="xs">
          {visibles.map((e) => (
            <Card key={e.id} withBorder padding="sm" className="tuile ligne-cliquable" opacity={e.archive ? 0.6 : 1} onClick={() => ouvrir(e.id)}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {e.nom}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {[sousTitre(e), e.emplacement, plusieursMaisons && e.maisonNom].filter(Boolean).join(" · ")}
                  </Text>
                </div>
                {e.archive ? (
                  <Badge color="gray" variant="light">
                    Archivé
                  </Badge>
                ) : (
                  <BadgeGarantie fin={e.finGarantie} court />
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card withBorder p={0}>
          <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élément</Table.Th>
                {plusieursMaisons && <Table.Th>Maison</Table.Th>}
                <Table.Th>Catégorie</Table.Th>
                <Table.Th>Emplacement</Table.Th>
                <Table.Th>Garantie</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibles.map((e) => (
                <Table.Tr key={e.id} className="ligne-cliquable" onClick={() => ouvrir(e.id)} opacity={e.archive ? 0.6 : 1}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {e.nom}
                      {e.archive && (
                        <Badge ml="xs" size="xs" color="gray" variant="light">
                          Archivé
                        </Badge>
                      )}
                    </Text>
                    {sousTitre(e) && (
                      <Text size="xs" c="dimmed">
                        {sousTitre(e)}
                      </Text>
                    )}
                  </Table.Td>
                  {plusieursMaisons && <Table.Td fz="sm">{e.maisonNom}</Table.Td>}
                  <Table.Td fz="sm">{e.categorie}</Table.Td>
                  <Table.Td fz="sm">{e.emplacement}</Table.Td>
                  <Table.Td>
                    <BadgeGarantie fin={e.finGarantie} court />
                  </Table.Td>
                  <Table.Td>
                    {e.nbDocuments > 0 && (
                      <Group gap={2} c="dimmed" wrap="nowrap">
                        <IconPaperclip size={14} />
                        <Text size="xs">{e.nbDocuments}</Text>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      <ModalElement element={null} maisonId={maisonFiltre ?? null} opened={creation} onClose={() => setCreation(false)} onCree={ouvrir} />
    </Stack>
  );
}
