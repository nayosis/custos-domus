import { Card, Group, List, Stack, Table, Text, Title } from "@mantine/core";
import { IconCalendarEvent, IconRotateClockwise, IconTool } from "@tabler/icons-react";
import { EXPLICATIONS_NATURE, NATURES, type Nature } from "../lib/entretiens";

const ICONES: Record<Nature, typeof IconTool> = { tache: IconTool, rdv: IconCalendarEvent, routine: IconRotateClockwise };
const ORDRE: Nature[] = ["tache", "rdv", "routine"];

/** Ce qui change selon la nature, ligne par ligne (les délais et l'ancrage restent modifiables sur chaque fiche). */
const LIGNES: { critere: string; valeurs: Record<Nature, string> }[] = [
  {
    critere: "Pour",
    valeurs: {
      tache: "Ce qu'on fait soi-même : purger les radiateurs, nettoyer la VMC",
      rdv: "Ce qu'il faut faire faire par quelqu'un : ramonage, révision de la chaudière",
      routine: "Les petits gestes réguliers : poubelles, arrosage, draps",
    },
  },
  {
    critere: "Alerte",
    valeurs: { tache: "1 semaine avant l'échéance", rdv: "6 semaines avant, le temps de trouver un créneau", routine: "Le jour même" },
  },
  {
    critere: "Étapes",
    valeurs: {
      tache: "À faire → Fait",
      rdv: "À prendre → Rendez-vous pris (date, heure, prestataire) → Fait",
      routine: "À faire → Fait",
    },
  },
  {
    critere: "« Fait »",
    valeurs: {
      tache: "Date, coût, prestataire, note, facture",
      rdv: "Date, coût, prestataire, note, facture",
      routine: "En un geste, à la date du jour, sans coût ni prestataire",
    },
  },
  {
    critere: "Fois suivante",
    valeurs: {
      tache: "Date réelle + intervalle : en retard, tout se décale",
      rdv: "Date réelle + intervalle",
      routine: "Calendrier fixe : la poubelle du mercredi reste le mercredi, même sortie en retard",
    },
  },
  {
    critere: "Rappels",
    valeurs: {
      tache: "Pendant la fenêtre d'alerte, relance chaque semaine tant que ce n'est pas fait",
      rdv: "Relance tant que le rendez-vous n'est pas pris, puis rappel la veille du rendez-vous",
      routine: "Le jour même ; absente de « Prochainement »",
    },
  },
  {
    critere: "Agenda",
    valeurs: { tache: "L'échéance", rdv: "Le rendez-vous à son heure, alarme 1 h avant", routine: "L'échéance" },
  },
];

/** Aide : ce qui distingue tâche, rendez-vous et routine, et comment marchent les missions des enfants. */
export function Aide() {
  return (
    <Stack gap="lg" maw={960}>
      <Title order={2}>Aide</Title>

      <Card withBorder>
        <Title order={4} mb="xs">
          Tâche, rendez-vous ou routine ?
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          Les trois sont des choses à faire : une échéance, et une répétition possible (tous les N jours, semaines, mois ou ans) ou une seule fois. Seule la
          nature change leur comportement.
        </Text>
        <Stack gap="xs" mb="md">
          {ORDRE.map((n) => {
            const Icone = ICONES[n];
            return (
              <Group key={n} gap="sm" wrap="nowrap" align="flex-start">
                <Icone size={18} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0, marginTop: 2 }} />
                <Text size="sm">
                  <b>{NATURES[n]}</b> : {EXPLICATIONS_NATURE[n].charAt(0).toLowerCase() + EXPLICATIONS_NATURE[n].slice(1)}
                </Text>
              </Group>
            );
          })}
        </Stack>
        <Table.ScrollContainer minWidth={640}>
          <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                {ORDRE.map((n) => (
                  <Table.Th key={n}>{NATURES[n]}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {LIGNES.map((l) => (
                <Table.Tr key={l.critere}>
                  <Table.Th scope="row" style={{ whiteSpace: "nowrap" }}>
                    {l.critere}
                  </Table.Th>
                  {ORDRE.map((n) => (
                    <Table.Td key={n}>{l.valeurs[n]}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" mt="xs">
          Délai d'alerte et calcul de la fois suivante sont des réglages par défaut, modifiables sur chaque fiche.
        </Text>
      </Card>

      <Card withBorder>
        <Title order={4} mb="xs">
          Missions des enfants
        </Title>
        <List size="sm" spacing={4}>
          <List.Item>
            Dans n'importe quelle chose à faire, « Confier aux enfants » en fait une mission, avec des points (10 par défaut). Confiée à plusieurs : le
            premier qui la fait gagne les points.
          </List.Item>
          <List.Item>
            L'enfant la coche « C'est fait » (au plus deux jours avant l'échéance). S'il l'a faite avec un frère ou une sœur, il le dit : les points sont
            partagés, à parts égales ou comme ils l'ont convenu.
          </List.Item>
          <List.Item>Un parent valide ou refuse dans la page Famille ; sans réponse, la mission est validée d'office au bout de 48 h.</List.Item>
          <List.Item>Les points s'échangent contre les récompenses définies par les parents.</List.Item>
        </List>
      </Card>
    </Stack>
  );
}
