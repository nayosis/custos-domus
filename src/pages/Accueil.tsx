import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { IconHome } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listeMaisons } from "../data/maisons";
import { AvisMiseAJour } from "../components/MiseAJour";

/** Tableau de bord (provisoire) : il montrera les entretiens en retard, à planifier, les garanties qui expirent… */
export function Accueil() {
  const { data: maisons } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  return (
    <Stack p="lg" gap="lg">
      <Title order={2}>Tableau de bord</Title>
      <AvisMiseAJour />
      {maisons && maisons.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconHome size={40} color="var(--mantine-color-brique-5)" />
            <Text fw={600}>Bienvenue dans Custos Domus</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Pour commencer, enregistrez vos maisons ; vous y ajouterez ensuite vos équipements, leurs entretiens et leurs factures.
            </Text>
            <Button component={Link} to="/maisons" mt="sm">
              Ajouter une maison
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
