import { Anchor, Box, Card, Grid, Group, Select, Stack, Text, Title } from "@mantine/core";
import { IconBox } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { aFaireMaison, listeMaisons } from "../data/maisons";
import { BadgeSituation, Entretiens, IconeNature } from "../components/Entretiens";
import { Historique } from "../components/Historique";
import { aujourdhui } from "../lib/dates";
import { NATURES, situation, type Nature } from "../lib/entretiens";
import { aFaireRoute } from "../router";

/** Ce qui est à faire sur les éléments de la maison : en lecture, chaque ligne mène à la fiche de l'élément. */
function SurLesElements({ lignes }: { lignes: Awaited<ReturnType<typeof aFaireMaison>>["surElements"] }) {
  const jour = aujourdhui();
  return (
    <Card withBorder>
      <Group gap="xs" mb="xs">
        <IconBox size={18} />
        <Title order={4}>Sur les éléments</Title>
      </Group>
      {lignes.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm" ta="center">
          Rien de suivi sur les éléments de cette maison.
        </Text>
      ) : (
        <Stack gap={0}>
          {lignes.map((e) => (
            <Group key={e.id} gap="sm" wrap="nowrap" py="xs" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
              <IconeNature nature={e.nature} />
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} size="sm">
                    {e.titre}
                  </Text>
                  <BadgeSituation e={e} s={situation(e, jour)} />
                </Group>
                <Text size="xs" c="dimmed" truncate>
                  {NATURES[e.nature as Nature]} ·{" "}
                  <Anchor size="xs" renderRoot={(p) => <Link {...p} to="/elements/$id" params={{ id: e.elementId! }} />}>
                    {e.elementNom}
                  </Anchor>
                </Text>
              </Box>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

/**
 * « À faire » d'une maison : les routines et tâches de la maison elle-même (poubelles, tonte…) avec leur
 * historique, et ce qui attend sur ses éléments.
 */
export function AFaire() {
  const { maison: choisie } = aFaireRoute.useSearch();
  const naviguer = useNavigate();
  const { data: maisons } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const actives = (maisons ?? []).filter((m) => !m.archivee);
  const maisonId = choisie ?? actives[0]?.id ?? null;
  const { data } = useQuery({ queryKey: ["a-faire", maisonId], queryFn: () => aFaireMaison(maisonId!), enabled: !!maisonId });

  return (
    <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>À faire</Title>
          <Text size="sm" c="dimmed">
            Ce qui se fait sur la maison elle-même : poubelles, tonte, arrosage… Les équipements ont les leurs sur leur fiche.
          </Text>
        </div>
        {(maisons?.length ?? 0) > 1 && (
          <Select
            aria-label="Maison"
            w={{ base: "100%", sm: 260 }}
            data={(maisons ?? []).map((m) => ({ value: m.id, label: m.archivee ? `${m.nom} (archivée)` : m.nom }))}
            value={maisonId}
            onChange={(id) => id && naviguer({ to: "/a-faire", search: { maison: id } })}
            allowDeselect={false}
          />
        )}
      </Group>

      {maisons && !maisonId && (
        <Text c="dimmed" size="sm">
          Ajoutez d'abord une{" "}
          <Anchor size="sm" renderRoot={(p) => <Link {...p} to="/maisons" />}>
            maison
          </Anchor>
          .
        </Text>
      )}

      {data && (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="lg">
              <Entretiens ou={{ maisonId: data.maison.id }} categorie="Routines" entretiens={data.entretiens} archive={data.maison.archivee} />
              <SurLesElements lignes={data.surElements} />
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Historique ou={{ maisonId: data.maison.id }} historique={data.historique} />
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
