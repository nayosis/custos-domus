import { useState, type ReactNode } from "react";
import { Anchor, Badge, Box, Button, Card, Collapse, Grid, Group, Menu, SegmentedControl, Select, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import {
  IconCalendarCheck, IconCheck, IconChevronDown, IconChevronRight, IconCircleCheck, IconHome, IconListCheck, IconPhone, IconPlus, IconReceipt, IconShieldCheck,
  IconTool,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { aFaireMaison, listeMaisons } from "../data/maisons";
import { tableauDeBord } from "../data/tableauDeBord";
import { AvisMiseAJour } from "../components/MiseAJour";
import { BadgeGarantie } from "../components/BadgeGarantie";
import { BadgeSituation, Ligne, useActionsEntretiens } from "../components/Entretiens";
import { Historique } from "../components/Historique";
import { Chronologie } from "../components/Chronologie";
import { dateLisible, euros } from "../lib/dates";
import { estFrequente, QUI, quiDe, situation, type Qui, type Situation } from "../lib/entretiens";
import { useEcran } from "../lib/ecran";
import { accueilRoute } from "../router";

type Donnees = Awaited<ReturnType<typeof tableauDeBord>>;
type LigneAF = Donnees["entretiens"][number];
type Classe = LigneAF & { s: Situation };

/** « Plus tard » : jusqu'à 3 mois ; au-delà, replié. */
const PLUS_TARD_JOURS = 92;

type Section = "retard" | "aujourdhui" | "semaine" | "plusTard" | "loin";
const SECTIONS: { cle: Section; titre: string; vide?: string }[] = [
  { cle: "retard", titre: "En retard" },
  { cle: "aujourdhui", titre: "Aujourd'hui" },
  { cle: "semaine", titre: "Cette semaine" },
  { cle: "plusTard", titre: "Plus tard" },
];

/**
 * Où ranger une chose à faire. Rendez-vous pris : à part (colonne de droite). Un rendez-vous à prendre dont la
 * fenêtre est ouverte : cette semaine (c'est maintenant qu'on appelle). Ce qui revient chaque jour ou chaque
 * semaine : seulement le moment venu.
 */
function section(e: Classe): Section | null {
  const s = e.s;
  if (s.etat === "rdv_pris" || s.etat === "inactif") return null;
  if (s.etat === "en_retard") return "retard";
  if (s.jours === 0) return "aujourdhui";
  if (estFrequente(e)) return s.etat === "a_prevoir" ? "semaine" : null;
  if (s.jours <= 7 || (e.avecRdv && s.etat === "a_prevoir")) return "semaine";
  return s.jours <= PLUS_TARD_JOURS ? "plusTard" : "loin";
}

/** « Mardi 27 octobre 2026 ». */
function aujourdhuiLong() {
  const t = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Carte titrée ; son contenu ou, à défaut, une phrase discrète. */
function Bloc({ titre, icone, vide, droite, children }: { titre: string; icone: ReactNode; vide?: ReactNode; droite?: ReactNode; children?: ReactNode }) {
  return (
    <Card withBorder>
      <Group gap="xs" mb="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          {icone}
          <Title order={4}>{titre}</Title>
        </Group>
        {droite}
      </Group>
      {children || (
        <Text size="sm" c="dimmed" py="sm">
          {vide}
        </Text>
      )}
    </Card>
  );
}

/**
 * Où se trouve la chose : lien vers la fiche de l'élément (ou du véhicule), avec sa maison quand on regarde toutes
 * les maisons ; pour ce qui se fait sur la maison elle-même, « Sur la maison » (ou son nom).
 */
function Ou({
  elementId, elementNom, maisonId, maisonNom, avecMaison,
}: { elementId: string | null; elementNom: string | null; maisonId: string | null; maisonNom: string | null; avecMaison: boolean }) {
  return (
    <Text size="xs" c="dimmed" truncate>
      {elementId || !maisonId ? (
        <>
          <Anchor size="xs" c="dimmed" renderRoot={(p) => <Link {...p} to="/elements/$id" params={{ id: elementId ?? "" }} />}>
            {elementNom}
          </Anchor>
          {avecMaison && maisonNom && ` · ${maisonNom}`}
        </>
      ) : avecMaison ? (
        `Sur la maison · ${maisonNom}`
      ) : (
        "Sur la maison"
      )}
    </Text>
  );
}

/** Une liste repliable (« Plus loin », « Terminées ou suspendues »). */
function Repli({ titre, children }: { titre: string; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <UnstyledButton onClick={() => setOuvert((o) => !o)} mt="xs">
        <Group gap={4} c="dimmed">
          {ouvert ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Text size="xs">{titre}</Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={ouvert}>{children}</Collapse>
    </>
  );
}

/**
 * « À faire » : tout ce qui attend, des éléments, des véhicules et des maisons elles-mêmes, rangé par moment
 * (en retard, aujourd'hui, cette semaine, plus tard) ; filtres maison et « qui s'en charge ». À côté : rendez-vous
 * pris, garanties, dernières interventions (l'historique de la maison quand on en regarde une), dépenses.
 */
export function AFaire() {
  const { maison: filtre, qui = "", vue } = accueilRoute.useSearch();
  const naviguer = useNavigate();
  const { telephone } = useEcran();
  const { data: maisons } = useQuery({ queryKey: ["maisons"], queryFn: () => listeMaisons() });
  const { data } = useQuery({ queryKey: ["tableau-de-bord", filtre ?? null], queryFn: () => tableauDeBord(filtre ?? null) });
  // La maison regardée (filtrée, ou la seule) : son historique complet est à un clic des dernières interventions.
  const actives = (maisons ?? []).filter((m) => !m.archivee);
  const maisonVue = filtre ?? (actives.length === 1 ? actives[0].id : null);
  const [historiqueMaison, setHistoriqueMaison] = useState(false);
  const { data: maison } = useQuery({ queryKey: ["a-faire", maisonVue], queryFn: () => aFaireMaison(maisonVue!), enabled: !!maisonVue && historiqueMaison });
  const { actions, ajouter, modales } = useActionsEntretiens({ categorie: "Routines" });

  const avecMaison = actives.length > 1 && !filtre;
  const filtrer = (p: { maison?: string | null; qui?: string; vue?: "chrono" | null }) => {
    const suite = { maison: p.maison !== undefined ? p.maison : filtre, qui: p.qui !== undefined ? p.qui : qui, vue: p.vue !== undefined ? p.vue : vue };
    naviguer({
      to: "/",
      search: { ...(suite.maison ? { maison: suite.maison } : {}), ...(suite.qui ? { qui: suite.qui } : {}), ...(suite.vue ? { vue: suite.vue } : {}) },
      replace: true,
    });
  };

  // Ajouter sur la maison elle-même ; plusieurs maisons sans filtre : on choisit laquelle.
  const cible = filtre ?? (actives.length === 1 ? actives[0].id : null);
  const boutonAjouter = cible ? (
    <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => ajouter({ maisonId: cible })}>
      Ajouter
    </Button>
  ) : actives.length > 1 ? (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="xs" leftSection={<IconPlus size={16} />}>
          Ajouter
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Sur quelle maison ?</Menu.Label>
        {actives.map((m) => (
          <Menu.Item key={m.id} onClick={() => ajouter({ maisonId: m.id })}>
            {m.nom}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  ) : null;

  const choixQui = [{ value: "", label: "Tous" }, ...(Object.keys(QUI) as Qui[]).map((q) => ({ value: q, label: q === "prestataire" ? "Prestataire" : q === "enfants" ? "Enfants" : QUI[q] }))];
  const entete = (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>À faire</Title>
          <Text c="dimmed" size="sm">
            {aujourdhuiLong()}
          </Text>
        </div>
        {actives.length > 1 &&
          (telephone ? (
            <Select
              w="100%"
              aria-label="Maison"
              data={[{ value: "", label: "Toutes les maisons" }, ...actives.map((m) => ({ value: m.id, label: m.nom }))]}
              value={filtre ?? ""}
              onChange={(v) => filtrer({ maison: v || null })}
              allowDeselect={false}
            />
          ) : (
            <SegmentedControl data={[{ value: "", label: "Toutes" }, ...actives.map((m) => ({ value: m.id, label: m.nom }))]} value={filtre ?? ""} onChange={(v) => filtrer({ maison: v || null })} />
          ))}
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
          Qui s'en charge
        </Text>
        <SegmentedControl size="xs" data={choixQui} value={qui} onChange={(v) => filtrer({ qui: v })} style={{ flex: telephone ? 1 : undefined }} />
      </Group>
    </Stack>
  );

  if (maisons && maisons.length === 0)
    return (
      <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
        <Title order={2}>À faire</Title>
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
  if (!data)
    return (
      <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
        {entete}
      </Stack>
    );

  const deQui = <T extends { points: number | null; prestataireId: string | null }>(e: T) => !qui || quiDe(e) === qui;
  const classes: Classe[] = data.entretiens.filter(deQui).map((e) => ({ ...e, s: situation(e, data.aujourdhui) }));
  const parSection = (c: Section) => classes.filter((e) => section(e) === c);
  const rendezVous = classes.filter((e) => e.s.etat === "rdv_pris").sort((a, b) => (a.dateRdv ?? "9999").localeCompare(b.dateRdv ?? "9999"));
  const loin = parSection("loin");
  const inactifs = data.inactifs.filter(deQui);
  const rien = SECTIONS.every((x) => parSection(x.cle).length === 0);
  const ligne = (e: LigneAF) => (
    <Ligne key={e.id} e={e} ou={<Ou elementId={e.elementId} elementNom={e.elementNom} maisonId={e.maisonId} maisonNom={e.maisonNom} avecMaison={avecMaison} />} {...actions(e)} />
  );
  const { depenses } = data;

  return (
    <Stack p={{ base: "sm", sm: "lg" }} gap="lg">
      {entete}
      <AvisMiseAJour />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <IconListCheck size={18} />
                <Title order={4}>{qui ? `À faire · ${choixQui.find((c) => c.value === qui)?.label}` : "À faire"}</Title>
              </Group>
              <Group gap="xs" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={vue ?? "liste"}
                  onChange={(v) => filtrer({ vue: v === "chrono" ? "chrono" : null })}
                  data={[
                    { value: "liste", label: "Liste" },
                    { value: "chrono", label: "Chronologie" },
                  ]}
                />
                {boutonAjouter}
              </Group>
            </Group>
            {vue === "chrono" ? (
              <Chronologie entretiens={classes} aujourdhui={data.aujourdhui} actions={actions} />
            ) : (
              <>
            {rien && (
              <Group gap="sm" py="sm" wrap="nowrap">
                <IconCircleCheck size={28} color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                <div>
                  <Text fw={600} size="sm">
                    Rien dans les trois mois
                  </Text>
                  <Text size="xs" c="dimmed">
                    {data.entretiens.length === 0 ? (
                      <>
                        Rien de suivi pour l'instant : ajoutez ce qui se fait sur la maison ici, ou{" "}
                        <Anchor size="xs" renderRoot={(p) => <Link {...p} to="/elements" search={filtre ? { maison: filtre } : {}} />}>
                          depuis la fiche d'un élément
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
            {SECTIONS.map(({ cle, titre }) => {
              const lignes = parSection(cle);
              if (!lignes.length) return null;
              return (
                <Box key={cle} mt="sm">
                  <Group gap={6}>
                    <Text size="xs" fw={700} c={cle === "retard" ? "red" : "dimmed"} tt="uppercase">
                      {titre}
                    </Text>
                    <Badge size="xs" variant="light" color={cle === "retard" ? "red" : "gray"}>
                      {lignes.length}
                    </Badge>
                  </Group>
                  <Stack gap={0}>{lignes.map(ligne)}</Stack>
                </Box>
              );
            })}
            {loin.length > 0 && (
              <Repli titre={`Plus loin, au-delà de trois mois (${loin.length})`}>
                <Stack gap={0}>{loin.map(ligne)}</Stack>
              </Repli>
            )}
            {inactifs.length > 0 && (
              <Repli titre={`Terminées ou suspendues (${inactifs.length})`}>
                <Stack gap={0}>{inactifs.map(ligne)}</Stack>
              </Repli>
            )}
            <Text size="xs" c="dimmed" mt="sm">
              Ce qui revient chaque jour ou chaque semaine n'apparaît que le moment venu. Sur un équipement ou un véhicule, on ajoute depuis sa fiche.
            </Text>
              </>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <Bloc titre="Rendez-vous pris" icone={<IconCalendarCheck size={18} />} vide="Aucun rendez-vous pris.">
              {rendezVous.length > 0 && (
                <Stack gap="sm">
                  {rendezVous.map((e) => (
                    <Group key={e.id} justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {e.titre}
                        </Text>
                        <Ou elementId={e.elementId} elementNom={e.elementNom} maisonId={e.maisonId} maisonNom={e.maisonNom} avecMaison={avecMaison} />
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
                        <Group gap={4} wrap="nowrap">
                          <Button size="compact-xs" variant="subtle" color="gray" onClick={actions(e).onRdv}>
                            Modifier
                          </Button>
                          <Button size="compact-xs" variant="subtle" leftSection={<IconCheck size={12} />} onClick={actions(e).onFaitDetails}>
                            Fait
                          </Button>
                        </Group>
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
            {historiqueMaison && maison ? (
              <Stack gap={4}>
                <Anchor size="xs" onClick={() => setHistoriqueMaison(false)}>
                  ← Dernières interventions
                </Anchor>
                <Historique ou={{ maisonId: maison.maison.id }} historique={maison.historique} />
              </Stack>
            ) : (
              <Bloc
                titre="Dernières interventions"
                icone={<IconTool size={18} />}
                vide="Rien n'a encore été consigné."
                droite={
                  maisonVue && (
                    <Anchor size="xs" onClick={() => setHistoriqueMaison(true)} style={{ flexShrink: 0 }}>
                      Sur la maison : historique
                    </Anchor>
                  )
                }
              >
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
                          <Ou elementId={r.elementId} elementNom={r.elementNom} maisonId={r.maisonId} maisonNom={r.maisonNom} avecMaison={avecMaison} />
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
            )}
            <Bloc titre={`Dépenses ${depenses.annee}`} icone={<IconReceipt size={18} />}>
              <Group justify="space-between" align="baseline">
                <Text fz={24} fw={600}>
                  {euros(depenses.entretien)}
                </Text>
                <Text size="xs" c="dimmed">
                  {depenses.annee - 1} : {euros(depenses.anneePrecedente)}
                  {depenses.achats ? ` · achats : ${euros(depenses.achats)}` : ""}
                </Text>
              </Group>
            </Bloc>
          </Stack>
        </Grid.Col>
      </Grid>
      {modales}
    </Stack>
  );
}
