import { useState, type ReactNode } from "react";
import { Anchor, Badge, Box, Button, Card, Grid, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import {
  IconAlertTriangle, IconCalendarCheck, IconCalendarDue, IconCalendarEvent, IconCheck, IconCircleCheck, IconHome, IconPhone, IconReceipt, IconShieldCheck, IconTool,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listeMaisons } from "../data/maisons";
import { tableauDeBord } from "../data/tableauDeBord";
import { AvisMiseAJour } from "../components/MiseAJour";
import { BadgeGarantie } from "../components/BadgeGarantie";
import { BadgeSituation, ModalRdv, type LigneEntretien } from "../components/Entretiens";
import { ModalRealisation } from "../components/ModalRealisation";
import { dateLisible, duree, euros } from "../lib/dates";
import { situation, type Situation } from "../lib/entretiens";
import { useEcran } from "../lib/ecran";
import { accueilRoute } from "../router";

type Donnees = Awaited<ReturnType<typeof tableauDeBord>>;
type Ligne = Donnees["entretiens"][number];
type Classe = Ligne & { s: Situation };

/** Fenêtre de « Prochainement » : ce qui vient après la période d'alerte, dans les 3 mois. */
const PROCHAINEMENT_JOURS = 92;

/** « Mardi 27 octobre 2026 ». */
function aujourdhuiLong() {
  const t = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « 2 rendez-vous à prendre, 1 tâche » : ce qu'il y a à prévoir, par nature. */
function detailAPrevoir(liste: { nature: string }[]) {
  const rdv = liste.filter((e) => e.nature === "rdv").length;
  const taches = liste.length - rdv;
  return [rdv && `${rdv} rendez-vous à prendre`, taches && `${taches} tâche${taches > 1 ? "s" : ""}`].filter(Boolean).join(", ");
}

/** Chiffre clé : libellé, valeur, précision ; la couleur n'est portée que par l'icône (avec son libellé). */
function Tuile({ label, valeur, detail, icone, couleur }: { label: string; valeur: ReactNode; detail: ReactNode; icone: ReactNode; couleur: string }) {
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <ThemeIcon variant="light" color={couleur} size="md" radius="md">
          {icone}
        </ThemeIcon>
      </Group>
      <Text fz={28} fw={600} lh={1.2} mt={4} ff="var(--mantine-font-family)">
        {valeur}
      </Text>
      <Text size="xs" c="dimmed" mt={2} truncate>
        {detail}
      </Text>
    </Card>
  );
}

/** Carte titrée ; son contenu ou, à défaut, une phrase discrète. */
function Bloc({ titre, icone, vide, children }: { titre: string; icone: ReactNode; vide?: ReactNode; children?: ReactNode }) {
  return (
    <Card withBorder>
      <Group gap="xs" mb="xs">
        {icone}
        <Title order={4}>{titre}</Title>
      </Group>
      {children || (
        <Text size="sm" c="dimmed" py="sm">
          {vide}
        </Text>
      )}
    </Card>
  );
}

/** Lien vers la fiche de l'élément, avec sa maison quand on regarde toutes les maisons. */
function Ou({ elementId, elementNom, maisonNom, avecMaison }: { elementId: string; elementNom: string; maisonNom: string; avecMaison: boolean }) {
  return (
    <Text size="xs" c="dimmed" truncate>
      <Anchor size="xs" c="dimmed" renderRoot={(p) => <Link {...p} to="/elements/$id" params={{ id: elementId }} />}>
        {elementNom}
      </Anchor>
      {avecMaison && ` · ${maisonNom}`}
    </Text>
  );
}

function LigneAFaire({ e, avecMaison, onRdv, onFait }: { e: Classe; avecMaison: boolean; onRdv: () => void; onFait: () => void }) {
  const aPrendre = e.nature === "rdv";
  return (
    <Group gap="sm" wrap="nowrap" py="xs" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
      {aPrendre ? <IconCalendarEvent size={20} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0 }} /> : <IconTool size={20} color="var(--mantine-color-brique-6)" style={{ flexShrink: 0 }} />}
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs">
          <Text fw={600} size="sm">
            {e.titre}
          </Text>
          <BadgeSituation e={e} s={e.s} />
        </Group>
        <Ou elementId={e.elementId} elementNom={e.elementNom} maisonNom={e.maisonNom} avecMaison={avecMaison} />
      </Box>
      <Button size="xs" variant={aPrendre ? "light" : "filled"} leftSection={aPrendre ? <IconCalendarCheck size={14} /> : <IconCheck size={14} />} onClick={aPrendre ? onRdv : onFait}>
        {aPrendre ? "RDV pris" : "Fait"}
      </Button>
    </Group>
  );
}

export function Accueil() {
  const { maison: filtre } = accueilRoute.useSearch();
  const naviguer = useNavigate();
  const { telephone } = useEcran();
  const { data: maisons } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const { data } = useQuery({ queryKey: ["tableau-de-bord", filtre ?? null], queryFn: () => tableauDeBord(filtre ?? null) });
  const [rdv, setRdv] = useState<Ligne | null>(null);
  const [fait, setFait] = useState<Ligne | null>(null);

  const actives = (maisons ?? []).filter((m) => !m.archivee);
  const avecMaison = actives.length > 1 && !filtre;
  const choisirMaison = (m: string | null) => naviguer({ to: "/", search: m ? { maison: m } : {}, replace: true });

  const entete = (
    <Group justify="space-between" align="flex-end">
      <div>
        <Title order={2}>Tableau de bord</Title>
        <Text c="dimmed" size="sm">
          {aujourdhuiLong()}
        </Text>
      </div>
      {actives.length > 1 &&
        (telephone ? (
          <Select
            w="100%"
            data={[{ value: "", label: "Toutes les maisons" }, ...actives.map((m) => ({ value: m.id, label: m.nom }))]}
            value={filtre ?? ""}
            onChange={(v) => choisirMaison(v || null)}
            allowDeselect={false}
          />
        ) : (
          <SegmentedControl data={[{ value: "", label: "Toutes" }, ...actives.map((m) => ({ value: m.id, label: m.nom }))]} value={filtre ?? ""} onChange={(v) => choisirMaison(v || null)} />
        ))}
    </Group>
  );

  if (maisons && maisons.length === 0)
    return (
      <Stack p="lg" gap="lg">
        {entete}
        <AvisMiseAJour />
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
      </Stack>
    );
  if (!data) return <Stack p="lg">{entete}</Stack>;

  const classes: Classe[] = data.entretiens.map((e) => ({ ...e, s: situation(e, data.aujourdhui) }));
  const enRetard = classes.filter((e) => e.s.etat === "en_retard");
  const aPrevoir = classes.filter((e) => e.s.etat === "a_prevoir");
  const rendezVous = classes.filter((e) => e.s.etat === "rdv_pris").sort((a, b) => (a.dateRdv ?? "9999").localeCompare(b.dateRdv ?? "9999"));
  const prochainement = classes.filter((e) => e.s.etat === "a_venir" && e.s.jours <= PROCHAINEMENT_JOURS);
  const aFaire = [...enRetard, ...aPrevoir];
  const prochainRdv = rendezVous.find((e) => e.dateRdv);
  const { depenses } = data;
  const rien = classes.length === 0;

  return (
    <Stack p="lg" gap="lg">
      {entete}
      <AvisMiseAJour />

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Tuile
          label="En retard"
          valeur={enRetard.length}
          detail={enRetard.length ? `le plus ancien : ${duree(enRetard[0].s.etat === "en_retard" ? enRetard[0].s.jours : 0)}` : "Rien en retard"}
          icone={<IconAlertTriangle size={18} />}
          couleur={enRetard.length ? "red" : "gray"}
        />
        <Tuile
          label="À prévoir"
          valeur={aPrevoir.length}
          detail={aPrevoir.length ? detailAPrevoir(aPrevoir) : "Rien dans l'immédiat"}
          icone={<IconCalendarDue size={18} />}
          couleur={aPrevoir.length ? "orange" : "gray"}
        />
        <Tuile
          label="Rendez-vous pris"
          valeur={rendezVous.length}
          detail={prochainRdv ? `prochain le ${dateLisible(prochainRdv.dateRdv, { day: "numeric", month: "long" })}` : "Aucun de prévu"}
          icone={<IconCalendarCheck size={18} />}
          couleur={rendezVous.length ? "blue" : "gray"}
        />
        <Tuile
          label={`Dépenses ${depenses.annee}`}
          valeur={euros(depenses.entretien)}
          detail={`${depenses.annee - 1} : ${euros(depenses.anneePrecedente)}${depenses.achats ? ` · achats : ${euros(depenses.achats)}` : ""}`}
          icone={<IconReceipt size={18} />}
          couleur="brique"
        />
      </SimpleGrid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="lg">
            <Bloc titre="À faire" icone={<IconCalendarDue size={18} />}>
              {aFaire.length ? (
                <Stack gap={0}>
                  {aFaire.map((e) => (
                    <LigneAFaire key={e.id} e={e} avecMaison={avecMaison} onRdv={() => setRdv(e)} onFait={() => setFait(e)} />
                  ))}
                </Stack>
              ) : (
                <Group gap="sm" py="sm" wrap="nowrap">
                  <IconCircleCheck size={28} color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                  <div>
                    <Text fw={600} size="sm">
                      Tout est à jour
                    </Text>
                    <Text size="xs" c="dimmed">
                      {rien ? (
                        <>
                          Aucun entretien suivi pour l'instant :{" "}
                          <Anchor size="xs" renderRoot={(p) => <Link {...p} to="/elements" search={filtre ? { maison: filtre } : {}} />}>
                            ajoutez-en depuis la fiche d'un élément
                          </Anchor>
                          .
                        </>
                      ) : (
                        "Vous serez prévenu à l'approche de la prochaine échéance."
                      )}
                    </Text>
                  </div>
                </Group>
              )}
            </Bloc>
            <Bloc titre="Prochainement" icone={<IconCalendarEvent size={18} />} vide="Rien dans les trois prochains mois.">
              {prochainement.length > 0 && (
                <Stack gap={6}>
                  {prochainement.map((e) => (
                    <Group key={e.id} justify="space-between" wrap="nowrap" gap="sm">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {e.titre}
                        </Text>
                        <Ou elementId={e.elementId} elementNom={e.elementNom} maisonNom={e.maisonNom} avecMaison={avecMaison} />
                      </Box>
                      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                        {dateLisible(e.echeance, { day: "numeric", month: "short" })}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Bloc>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <Bloc titre="Rendez-vous" icone={<IconCalendarCheck size={18} />} vide="Aucun rendez-vous pris.">
              {rendezVous.length > 0 && (
                <Stack gap="sm">
                  {rendezVous.map((e) => (
                    <Group key={e.id} justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {e.titre}
                        </Text>
                        <Ou elementId={e.elementId} elementNom={e.elementNom} maisonNom={e.maisonNom} avecMaison={avecMaison} />
                        {e.prestataireNom && (
                          <Text size="xs" c="dimmed">
                            {e.prestataireNom}
                            {e.prestataireTelephone && (
                              <>
                                {" · "}
                                <Anchor size="xs" href={`tel:${e.prestataireTelephone.replace(/\s/g, "")}`}>
                                  <IconPhone size={10} /> {e.prestataireTelephone}
                                </Anchor>
                              </>
                            )}
                          </Text>
                        )}
                      </Box>
                      <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                        <BadgeSituation e={e} s={e.s} />
                        <Button size="compact-xs" variant="subtle" leftSection={<IconCheck size={12} />} onClick={() => setFait(e)}>
                          Fait
                        </Button>
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              )}
            </Bloc>
            <Bloc titre="Garanties" icone={<IconShieldCheck size={18} />} vide="Aucune garantie n'expire dans les trois mois.">
              {data.garanties.length > 0 && (
                <Stack gap="sm">
                  {data.garanties.map((g) => (
                    <Group key={g.id} justify="space-between" wrap="nowrap" gap="sm">
                      <Box style={{ minWidth: 0 }}>
                        <Anchor size="sm" fw={500} c="inherit" renderRoot={(p) => <Link {...p} to="/elements/$id" params={{ id: g.id }} />}>
                          {g.nom}
                        </Anchor>
                        {avecMaison && (
                          <Text size="xs" c="dimmed">
                            {g.maisonNom}
                          </Text>
                        )}
                      </Box>
                      <BadgeGarantie fin={g.finGarantie} />
                    </Group>
                  ))}
                </Stack>
              )}
            </Bloc>
            <Bloc titre="Dernières interventions" icone={<IconTool size={18} />} vide="Rien n'a encore été consigné.">
              {data.dernieres.length > 0 && (
                <Stack gap="sm">
                  {data.dernieres.map((r) => (
                    <Group key={r.id} justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                      <Box style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={500} truncate>
                            {r.titre}
                          </Text>
                          {!r.entretienId && (
                            <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                              Intervention
                            </Badge>
                          )}
                        </Group>
                        <Ou elementId={r.elementId} elementNom={r.elementNom} maisonNom={r.maisonNom} avecMaison={avecMaison} />
                      </Box>
                      <Box ta="right" style={{ flexShrink: 0 }}>
                        <Text size="xs" c="dimmed">
                          {dateLisible(r.date, { day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                        {r.cout != null && <Text size="sm">{euros(r.cout)}</Text>}
                      </Box>
                    </Group>
                  ))}
                </Stack>
              )}
            </Bloc>
          </Stack>
        </Grid.Col>
      </Grid>

      <ModalRdv entretien={rdv as LigneEntretien | null} onClose={() => setRdv(null)} />
      <ModalRealisation elementId={fait?.elementId ?? ""} cible={fait ? { mode: "entretien", entretien: fait } : null} onClose={() => setFait(null)} />
    </Stack>
  );
}
