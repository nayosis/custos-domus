import { useState, type ReactNode } from "react";
import { ActionIcon, Alert, Anchor, Badge, Breadcrumbs, Button, Card, Grid, Group, Menu, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArchive, IconDots, IconPencil, IconReplace, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ficheElement, majElement, supprimerElement } from "../data/elements";
import { BadgeGarantie } from "../components/BadgeGarantie";
import { Documents } from "../components/Documents";
import { Entretiens } from "../components/Entretiens";
import { Historique } from "../components/Historique";
import { ModalElement } from "../components/ModalElement";
import { ModalRemplacement } from "../components/ModalRemplacement";
import { Compteur, ModalReleve, ModalVehicule } from "../components/Vehicule";
import { dernierReleve } from "../lib/vehicules";
import { dateLisible, euros } from "../lib/dates";
import { ecrire } from "../lib/query";
import { ficheElementRoute } from "../router";

/** Une caractéristique : libellé discret au-dessus, valeur (ou rien si vide). */
function Info({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children}</Text>
    </div>
  );
}

export function FicheElement() {
  const { id } = ficheElementRoute.useParams();
  const { releve: releveDemande } = ficheElementRoute.useSearch();
  const naviguer = useNavigate();
  const { data, error } = useQuery({ queryKey: ["element", id], queryFn: () => ficheElement(id) });
  const [edition, setEdition] = useState(false);
  const [remplacement, setRemplacement] = useState(false);
  // Ouverte d'office quand on arrive depuis la notification « Relevé du compteur ».
  const [releve, setReleve] = useState(!!releveDemande);

  if (error)
    return (
      <Stack p="lg">
        <Alert color="red" title="Élément introuvable">
          Il a peut-être été supprimé. <Link to="/elements">Retour aux éléments</Link>
        </Alert>
      </Stack>
    );
  if (!data) return null;
  const { element: e, maison, documents, entretiens, historique, remplace, remplacant, releves } = data;
  const vehicule = e.type === "vehicule";
  const retour = () => (maison ? naviguer({ to: "/elements", search: { maison: maison.id } }) : naviguer({ to: "/vehicules" }));

  const supprimer = () =>
    modals.openConfirmModal({
      title: `Supprimer « ${e.nom} » ?`,
      children: (
        <Text size="sm">
          Ses entretiens, son historique et ses {documents.length > 0 ? `${documents.length} document(s)` : "documents"} seront supprimés. Pour le garder sans
          alertes (appareil vendu, jeté), archivez-le plutôt.
        </Text>
      ),
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if ((await ecrire(() => supprimerElement(e.id))) !== undefined) retour();
      },
    });
  const marqueModele = [e.marque, e.modele].filter(Boolean).join(" ");
  const aDesInfos = marqueModele || e.numeroSerie || e.emplacement || e.categorie || e.immatriculation;
  const aDesAchats = e.dateAchat || e.dateMiseEnService || e.prix != null || e.vendeur || e.finGarantie;

  return (
    <Stack p="lg" gap="lg">
      <Breadcrumbs separatorMargin={6}>
        {maison ? (
          [
            <Anchor key="e" component={Link} to="/elements" size="sm">
              Éléments
            </Anchor>,
            <Anchor key="m" size="sm" renderRoot={(props) => <Link {...props} to="/elements" search={{ maison: maison.id }} />}>
              {maison.nom}
            </Anchor>,
          ]
        ) : (
          <Anchor component={Link} to="/vehicules" size="sm">
            Véhicules
          </Anchor>
        )}
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{e.nom}</Title>
          <Group gap="xs" mt={6}>
            {e.categorie && !vehicule && (
              <Badge variant="light" color="brique" style={{ textTransform: "none" }}>
                {e.categorie}
              </Badge>
            )}
            {e.archive && (
              <Badge variant="light" color="gray">
                Archivé
              </Badge>
            )}
            {vehicule && e.immatriculation && (
              <Badge variant="outline" color="gray" style={{ textTransform: "none", letterSpacing: 1 }}>
                {e.immatriculation}
              </Badge>
            )}
            {!e.archive && <BadgeGarantie fin={e.finGarantie} />}
          </Group>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" leftSection={<IconPencil size={16} />} onClick={() => setEdition(true)} visibleFrom="sm">
            Modifier
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Actions">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition(true)} hiddenFrom="sm">
                Modifier
              </Menu.Item>
              <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => ecrire(() => majElement(e.id, { archive: !e.archive }, e.modifieLe))}>
                {e.archive ? "Désarchiver" : "Archiver (vendu, jeté…)"}
              </Menu.Item>
              {!e.archive && !vehicule && (
                <Menu.Item leftSection={<IconReplace size={14} />} onClick={() => setRemplacement(true)}>
                  Remplacer par un nouveau…
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={supprimer}>
                Supprimer
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {remplacant && (
        <Alert color="gray" variant="light">
          Remplacé par{" "}
          <Anchor renderRoot={(props) => <Link {...props} to="/elements/$id" params={{ id: remplacant.id }} />}>
            {remplacant.nom}
          </Anchor>
          .
        </Alert>
      )}

      <Grid gap="lg">
        {/* Sur téléphone, les entretiens d'abord : c'est ce qu'on vient chercher. */}
        <Grid.Col span={{ base: 12, md: 7 }} order={{ base: 1, md: 2 }}>
          <Stack gap="lg">
            {vehicule && <Compteur vehicule={e} releves={releves} onRelever={() => setReleve(true)} />}
            <Entretiens ou={{ elementId: e.id }} categorie={e.categorie} entretiens={entretiens} archive={e.archive} vehicule={vehicule} />
            <Historique ou={{ elementId: e.id }} historique={historique} vehicule={vehicule} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }} order={{ base: 2, md: 1 }}>
          <Stack gap="lg">
            <Card withBorder>
              <Title order={4} mb="sm">
                Caractéristiques
              </Title>
              {aDesInfos ? (
                <SimpleGrid cols={2} spacing="sm">
                  <Info label="Marque et modèle">{marqueModele}</Info>
                  <Info label="Immatriculation">{e.immatriculation}</Info>
                  <Info label={vehicule ? "Mise en circulation" : "Mis en service le"}>{vehicule ? dateLisible(e.dateMiseEnService) : null}</Info>
                  <Info label="N° de série">{e.numeroSerie}</Info>
                  <Info label="Emplacement">{e.emplacement}</Info>
                  <Info label="Maison">{maison?.nom}</Info>
                </SimpleGrid>
              ) : (
                <Text size="sm" c="dimmed">
                  Marque, modèle, n° de série : utiles le jour où il faut appeler le SAV.
                </Text>
              )}
            </Card>
            <Card withBorder>
              <Title order={4} mb="sm">
                Achat et garantie
              </Title>
              {aDesAchats ? (
                <SimpleGrid cols={2} spacing="sm">
                  <Info label="Acheté le">{dateLisible(e.dateAchat)}</Info>
                  <Info label="Mis en service le">{vehicule ? null : dateLisible(e.dateMiseEnService)}</Info>
                  <Info label="Prix">{euros(e.prix)}</Info>
                  <Info label="Vendeur ou installateur">{e.vendeur}</Info>
                  <Info label="Fin de garantie">{dateLisible(e.finGarantie)}</Info>
                </SimpleGrid>
              ) : (
                <Text size="sm" c="dimmed">
                  Date d'achat et fin de garantie : vous serez prévenu un mois avant qu'elle n'expire.
                </Text>
              )}
            </Card>
            <Documents documents={documents} elementId={e.id} />
            {e.notes && (
              <Card withBorder>
                <Title order={4} mb="sm">
                  Notes
                </Title>
                <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                  {e.notes}
                </Text>
              </Card>
            )}
            {remplace.length > 0 && (
              <Text size="sm" c="dimmed">
                Remplace :{" "}
                {remplace.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <Anchor size="sm" renderRoot={(props) => <Link {...props} to="/elements/$id" params={{ id: r.id }} />}>
                      {r.nom}
                    </Anchor>
                  </span>
                ))}
              </Text>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {vehicule ? (
        <>
          <ModalVehicule vehicule={e} opened={edition} onClose={() => setEdition(false)} />
          <ModalReleve
            vehicule={e}
            dernier={dernierReleve(releves) as (typeof releves)[number] | null}
            opened={releve}
            onClose={() => {
              setReleve(false);
              if (releveDemande) naviguer({ to: "/elements/$id", params: { id: e.id }, search: {}, replace: true });
            }}
          />
        </>
      ) : (
        <ModalElement element={e} opened={edition} onClose={() => setEdition(false)} />
      )}
      <ModalRemplacement
        element={e}
        entretiensActifs={entretiens.filter((x) => x.actif).map((x) => x.titre)}
        opened={remplacement}
        onClose={() => setRemplacement(false)}
      />
    </Stack>
  );
}
