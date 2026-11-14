import { Card, Group, List, Stack, Table, Text, Title } from "@mantine/core";
import { IconCalendarEvent, IconTool, IconUsers } from "@tabler/icons-react";

/** Les trois réglages d'une chose à faire, chacun indépendant des autres. */
const REGLAGES = [
  {
    icone: IconTool,
    titre: "Tâche ou routine",
    texte: "Une tâche se fait une fois (réparer le portillon). Une routine revient selon une fréquence : chaque semaine, chaque mois, chaque année.",
  },
  {
    icone: IconUsers,
    titre: "Qui s'en charge",
    texte: "Nous, un prestataire (le ramoneur, le garage), ou les enfants : c'est alors une mission, avec des points.",
  },
  {
    icone: IconCalendarEvent,
    titre: "Prendre rendez-vous d'abord",
    texte: "Une étape en plus, « rendez-vous pris », pour ne pas oublier d'appeler. Cochée d'office avec un prestataire ; possible sans (contrôle technique).",
  },
];

/** Ce qui découle des réglages (les valeurs par défaut restent modifiables sur chaque fiche). */
const LIGNES: { critere: string; valeur: string }[] = [
  { critere: "Alerte", valeur: "6 semaines avant avec rendez-vous ; le jour même pour ce qui revient chaque jour ou chaque semaine ; sinon 1 semaine avant." },
  { critere: "Fois suivante", valeur: "À date fixe pour ce qui revient chaque jour ou semaine (la poubelle du mercredi reste le mercredi) ; sinon depuis la dernière fois (la vidange)." },
  { critere: "« Fait »", valeur: "En un geste, à la date du jour, quand c'est nous ou les enfants. Avec un prestataire ou un rendez-vous : date, coût, prestataire, facture." },
  { critere: "Une tâche faite", valeur: "Elle sort de la liste et reste dans l'historique." },
  { critere: "Une routine faite", valeur: "Elle revient seule à la date suivante ; reportez-la si le moment n'est pas venu (hiverner le salon de jardin quand le froid arrive)." },
  { critere: "Rendez-vous", valeur: "Relancé tant qu'il n'est pas pris, puis rappel la veille ; dans l'agenda à son heure, alarme 1 h avant." },
];

/** Aide : comment se décrit une chose à faire, et comment marchent les missions des enfants. */
export function Aide() {
  return (
    <Stack gap="lg" maw={960}>
      <Title order={2}>Aide</Title>

      <Card withBorder>
        <Title order={4} mb="xs">
          Une chose à faire, trois réglages
        </Title>
        <Stack gap="xs" mb="md">
          {REGLAGES.map((r) => (
            <Group key={r.titre} gap="sm" wrap="nowrap" align="flex-start">
              <r.icone size={18} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0, marginTop: 2 }} />
              <Text size="sm">
                <b>{r.titre}</b> : {r.texte.charAt(0).toLowerCase() + r.texte.slice(1)}
              </Text>
            </Group>
          ))}
        </Stack>
        <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
          <Table.Tbody>
            {LIGNES.map((l) => (
              <Table.Tr key={l.critere}>
                <Table.Th scope="row" style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {l.critere}
                </Table.Th>
                <Table.Td>{l.valeur}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt="xs">
          Délai d'alerte et calcul de la fois suivante sont des valeurs par défaut, modifiables sur chaque fiche.
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
