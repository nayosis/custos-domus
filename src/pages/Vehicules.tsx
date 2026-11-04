import { useState } from "react";
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconCar, IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { listeVehicules } from "../data/vehicules";
import { BadgeSituation } from "../components/Entretiens";
import { ModalVehicule } from "../components/Vehicule";
import { aujourdhui, dateLisible, euros } from "../lib/dates";
import { situation } from "../lib/entretiens";
import { km, libelleRythme } from "../lib/vehicules";

/** Les véhicules : compteur, prochaine chose à faire, dépenses de l'année ; chaque carte mène à la fiche. */
export function Vehicules() {
  const naviguer = useNavigate();
  const { data: vehicules } = useQuery({ queryKey: ["vehicules"], queryFn: () => listeVehicules() });
  const [ajout, setAjout] = useState(false);
  const jour = aujourdhui();

  return (
    <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Véhicules</Title>
          <Text size="sm" c="dimmed">
            Interventions, factures et entretiens de vos voitures ; vidanges et révisions prévues d'après le compteur.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAjout(true)}>
          Ajouter
        </Button>
      </Group>

      {vehicules?.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconCar size={40} color="var(--mantine-color-brique-5)" />
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Une batterie changée, une vidange chez le garagiste, le contrôle technique dans deux mois : ajoutez vos véhicules pour les suivre.
            </Text>
          </Stack>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {vehicules?.map((v) => (
          <UnstyledButton key={v.id} renderRoot={(p) => <Link {...p} to="/elements/$id" params={{ id: v.id }} />}>
            <Card withBorder className="tuile" h="100%" opacity={v.archive ? 0.6 : 1}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Group gap={6}>
                    <IconCar size={18} color="var(--mantine-color-brique-6)" />
                    <Text fw={600} truncate>
                      {v.nom}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {[v.immatriculation, [v.marque, v.modele].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                  </Text>
                </div>
                {v.archive && (
                  <Badge variant="light" color="gray">
                    Archivé
                  </Badge>
                )}
              </Group>
              <Text size="sm" mt="sm">
                {v.dernierReleve ? (
                  <>
                    {km(v.dernierReleve.km)}{" "}
                    <Text span size="xs" c="dimmed">
                      au {dateLisible(v.dernierReleve.date, { day: "numeric", month: "short" })}
                      {v.rythme ? ` · ${libelleRythme(v.rythme)}` : ""}
                    </Text>
                  </>
                ) : (
                  <Text span size="xs" c="dimmed">
                    Compteur jamais relevé
                  </Text>
                )}
              </Text>
              {v.prochaine && (
                <Group gap="xs" mt={6} wrap="nowrap">
                  <Text size="xs" truncate>
                    {v.prochaine.titre}
                  </Text>
                  <BadgeSituation e={v.prochaine} s={situation(v.prochaine, jour)} />
                </Group>
              )}
              {v.depensesAnnee > 0 && (
                <Text size="xs" c="dimmed" mt={6}>
                  {euros(v.depensesAnnee)} cette année
                </Text>
              )}
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <ModalVehicule vehicule={null} opened={ajout} onClose={() => setAjout(false)} onCree={(id) => naviguer({ to: "/elements/$id", params: { id } })} />
    </Stack>
  );
}
