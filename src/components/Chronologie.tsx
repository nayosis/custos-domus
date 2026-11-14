import { useState } from "react";
// Couleurs : celles des badges de la liste (rouge en retard, orange à prendre, bleu RDV pris).
import {
  Alert,
  Box,
  Group,
  Menu,
  Popover,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconBellRinging,
  IconCalendarCheck,
  IconCheck,
  IconClockPause,
  IconPencil,
  IconPlayerSkipForward,
  IconReceipt,
  IconUser,
} from "@tabler/icons-react";
import { dateLisible } from "../lib/dates";
import {
  ajouter,
  faitEnUnGeste,
  joursEntre,
  libelleHeure,
  lieu,
  occurrences,
  situation,
} from "../lib/entretiens";
import type { ActionsLigne, LigneAvecLieu } from "./Entretiens";

/** Jours passés montrés avant aujourd'hui. */
const PASSE = 5;
const HORIZONS = [7, 14, 30, 60] as const;
/** Hauteur d'un jour selon l'horizon : le fil reste proportionnel au temps. */
const HAUTEUR: Record<number, number> = { 7: 56, 14: 40, 30: 28, 60: 24 };
const CLE_HORIZON = "custos.chronologie.horizon";
const MOIS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

type Ligne = LigneAvecLieu & {
  elementNom: string | null;
  maisonNom: string | null;
};
type Fois = { e: Ligne; date: string; suivante: boolean; style: Style };
type Style = "retard" | "prendre" | "rdv" | "normal" | "suivante";

const COULEURS: Record<
  Style,
  { bg: string; c: string; bord: string; trait?: string }
> = {
  retard: {
    bg: "var(--mantine-color-red-light)",
    c: "var(--mantine-color-red-light-color)",
    bord: "var(--mantine-color-red-3)",
  },
  prendre: {
    bg: "var(--mantine-color-orange-light)",
    c: "var(--mantine-color-orange-light-color)",
    bord: "var(--mantine-color-orange-3)",
  },
  rdv: {
    bg: "var(--mantine-color-blue-light)",
    c: "var(--mantine-color-blue-light-color)",
    bord: "var(--mantine-color-blue-3)",
  },
  normal: {
    bg: "var(--mantine-color-body)",
    c: "var(--mantine-color-text)",
    bord: "var(--mantine-color-default-border)",
  },
  suivante: {
    bg: "transparent",
    c: "var(--mantine-color-dimmed)",
    bord: "var(--mantine-color-default-border)",
    trait: "dashed",
  },
};

const LEGENDE: Record<Style, string> = {
  retard: "en retard",
  prendre: "RDV à prendre",
  rdv: "RDV pris",
  normal: "",
  suivante: "fois suivantes (prévues)",
};

const lireHorizon = () => {
  try {
    const h = Number(localStorage.getItem(CLE_HORIZON));
    return (HORIZONS as readonly number[]).includes(h) ? h : 14;
  } catch {
    return 14;
  }
};

/** Une fois sur le fil : son menu d'actions (pour une fois seulement prévue, la modifier). */
function Pastille({
  f,
  actions,
  w,
}: {
  f: Fois;
  actions: ActionsLigne;
  w?: number;
}) {
  const { e } = f;
  const c = COULEURS[f.style];
  const aPrendre = !f.suivante && e.avecRdv && e.etat !== "rdv_pris";
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <UnstyledButton
          h={22}
          px={8}
          maw={w ?? 200}
          style={{
            flexShrink: 0,
            borderRadius: 6,
            border: `1px ${c.trait ?? "solid"} ${c.bord}`,
            background: c.bg,
            color: c.c,
            fontSize: 12,
            lineHeight: "20px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {e.points != null && (
            <IconUser size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
          )}
          {e.titre}
          {f.style === "rdv" && e.heureRdv
            ? ` · ${libelleHeure(e.heureRdv)}`
            : ""}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {[
            lieu(e, " · ") || "Sur la maison",
            f.suivante
              ? `prévue le ${dateLisible(f.date)}`
              : dateLisible(f.date),
          ].join(" — ")}
        </Menu.Label>
        {!f.suivante && (
          <>
            {aPrendre && (
              <Menu.Item
                leftSection={<IconCalendarCheck size={14} />}
                onClick={actions.onRdv}
              >
                Rendez-vous pris…
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<IconCheck size={14} />}
              onClick={actions.onFait}
            >
              {faitEnUnGeste(e) ? "Fait" : "Fait…"}
            </Menu.Item>
            {faitEnUnGeste(e) && (
              <Menu.Item
                leftSection={<IconReceipt size={14} />}
                onClick={actions.onFaitDetails}
              >
                Fait, avec coût ou facture…
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<IconClockPause size={14} />}
              onClick={() => actions.onEcheance("reporter")}
            >
              Reporter à…
            </Menu.Item>
            <Menu.Item
              leftSection={<IconPlayerSkipForward size={14} />}
              onClick={() => actions.onEcheance("passer")}
            >
              Passer cette fois…
            </Menu.Item>
            <Menu.Item
              leftSection={<IconBellRinging size={14} />}
              onClick={actions.onNotifier}
            >
              Notifier…
            </Menu.Item>
          </>
        )}
        <Menu.Item
          leftSection={<IconPencil size={14} />}
          onClick={actions.onModifier}
        >
          Modifier
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * Vue chronologique : un fil vertical proportionnel au temps, de 5 jours avant aujourd'hui à l'horizon choisi
 * (retenu sur cet appareil). Chaque chose à sa date ; les fois suivantes des routines en pointillés. Ce qui est en
 * retard depuis plus longtemps est rappelé au-dessus du fil.
 */
export function Chronologie({
  entretiens,
  aujourdhui,
  actions,
}: {
  entretiens: Ligne[];
  aujourdhui: string;
  actions: (e: Ligne) => ActionsLigne;
}) {
  const [horizon, setHorizon] = useState(lireHorizon);
  const { ref, width } = useElementSize();
  const choisir = (h: number) => {
    setHorizon(h);
    try {
      localStorage.setItem(CLE_HORIZON, String(h));
    } catch {
      /* préférence non retenue : sans gravité */
    }
  };
  const debut = ajouter(aujourdhui, -PASSE, "jour");
  const fin = ajouter(aujourdhui, horizon, "jour");
  const px = HAUTEUR[horizon];

  const avant: Ligne[] = [];
  const parJour = new Map<string, Fois[]>();
  for (const e of entretiens) {
    const s = situation(e, aujourdhui);
    for (const o of occurrences(e, aujourdhui, fin)) {
      if (o.date < debut) {
        if (!o.suivante) avant.push(e);
        continue;
      }
      if (o.date > fin) continue;
      const style: Style = o.suivante
        ? "suivante"
        : s.etat === "en_retard"
          ? "retard"
          : s.etat === "rdv_pris"
            ? "rdv"
            : e.avecRdv && s.etat === "a_prevoir"
              ? "prendre"
              : "normal";
      parJour.set(o.date, [
        ...(parJour.get(o.date) ?? []),
        { e, date: o.date, suivante: o.suivante, style },
      ]);
    }
  }
  // Dans une journée : d'abord ce qui presse, les fois seulement prévues à la fin.
  const ordre: Record<Style, number> = {
    retard: 0,
    prendre: 1,
    rdv: 2,
    normal: 3,
    suivante: 4,
  };
  // Place sur la ligne d'un jour : largeur estimée de chaque pastille (titre en 12 px, 200 px au plus).
  const place = width - 80;
  const largeur = (f: Fois) => Math.min(200, 22 + f.e.titre.length * 6.3 + (f.e.points != null ? 14 : 0)) + 6;
  const tenir = (fois: Fois[]) => {
    let pris = 0;
    let n = 0;
    for (const f of fois) {
      // Garder la place d'un « +N » s'il en reste après celle-ci.
      const besoin = pris + largeur(f) + (n < fois.length - 1 ? 40 : 0);
      if (n > 0 && besoin > place) break;
      pris += largeur(f);
      n++;
    }
    return fois.slice(0, n);
  };

  const jours: string[] = [];
  for (let d = debut; d <= fin; d = ajouter(d, 1, "jour")) jours.push(d);

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
          Afficher
        </Text>
        <SegmentedControl
          size="xs"
          value={String(horizon)}
          onChange={(v) => choisir(Number(v))}
          data={HORIZONS.map((h) => ({
            value: String(h),
            label: `${h} jours`,
          }))}
        />
      </Group>
      {avant.length > 0 && (
        <Alert
          color="red"
          variant="light"
          p="xs"
          icon={<IconAlertTriangle size={16} />}
        >
          <Text size="xs">
            En retard depuis plus de {PASSE} jours :{" "}
            {avant.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                {e.titre} (
                {dateLisible(e.echeance, { day: "numeric", month: "short" })})
              </span>
            ))}
          </Text>
        </Alert>
      )}
      <Box
        ref={ref}
        pos="relative"
        h={jours.length * px}
        style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
      >
        {jours.map((d, i) => {
          const date = new Date(`${d}T12:00:00`);
          const ecart = joursEntre(aujourdhui, d);
          const premier = date.getDate() === 1;
          const etiquette =
            px >= 28 ||
            date.getDay() === 1 ||
            premier ||
            ecart === 0 ||
            i === 0;
          const fois = (parJour.get(d) ?? []).sort(
            (a, b) => ordre[a.style] - ordre[b.style],
          );
          const visibles = tenir(fois);
          const reste = fois.slice(visibles.length);
          return (
            <Box
              key={d}
              pos="absolute"
              left={0}
              right={0}
              top={i * px}
              h={px}
              bg={ecart < 0 ? "var(--mantine-color-default-hover)" : undefined}
            >
              <Box
                pos="absolute"
                left={64}
                right={0}
                top={0}
                style={{
                  borderTop:
                    ecart === 0
                      ? "2px solid var(--mantine-color-brique-6)"
                      : `1px ${premier ? "solid" : "dotted"} var(--mantine-color-default-border)`,
                }}
              />
              {etiquette && (
                <Text
                  pos="absolute"
                  left={0}
                  top={2}
                  w={60}
                  fz={11}
                  lh="13px"
                  fw={ecart === 0 ? 600 : 400}
                  c={ecart === 0 ? "brique.7" : "dimmed"}
                >
                  {ecart === 0
                    ? "Aujourd'hui"
                    : `${JOURS[date.getDay()]} ${date.getDate()}${premier || i === 0 ? ` ${MOIS[date.getMonth()]}` : ""}`}
                </Text>
              )}
              {fois.length > 0 && (
                <Group
                  pos="absolute"
                  left={72}
                  right={4}
                  top={Math.max(1, (px - 22) / 2)}
                  gap={6}
                  wrap="nowrap"
                  style={{ overflow: "hidden" }}
                >
                  {visibles.map((f) => (
                    <Pastille
                      key={`${f.e.id}-${f.date}`}
                      f={f}
                      actions={actions(f.e)}
                    />
                  ))}
                  {reste.length > 0 && (
                    <Popover position="bottom-start" withinPortal>
                      <Popover.Target>
                        <UnstyledButton
                          h={22}
                          px={8}
                          fz={12}
                          c="dimmed"
                          style={{
                            flexShrink: 0,
                            borderRadius: 6,
                            border:
                              "1px solid var(--mantine-color-default-border)",
                          }}
                        >
                          +{reste.length}
                        </UnstyledButton>
                      </Popover.Target>
                      <Popover.Dropdown p="xs">
                        <Stack gap={6} align="flex-start">
                          {reste.map((f) => (
                            <Pastille
                              key={`${f.e.id}-${f.date}`}
                              f={f}
                              actions={actions(f.e)}
                              w={260}
                            />
                          ))}
                        </Stack>
                      </Popover.Dropdown>
                    </Popover>
                  )}
                </Group>
              )}
            </Box>
          );
        })}
      </Box>
      <Group gap="md" fz={12} c="dimmed">
        {(["retard", "prendre", "rdv", "suivante"] as Style[]).map((st) => (
          <Group key={st} gap={4} wrap="nowrap">
            <Box
              w={14}
              h={12}
              style={{
                borderRadius: 3,
                background: COULEURS[st].bg,
                border: `1px ${COULEURS[st].trait ?? "solid"} ${COULEURS[st].bord}`,
              }}
            />
            <Text size="xs" c="dimmed">
              {LEGENDE[st]}
            </Text>
          </Group>
        ))}
        <Group gap={4} wrap="nowrap">
          <IconUser size={12} />
          <Text size="xs" c="dimmed">
            enfants
          </Text>
        </Group>
      </Group>
    </Stack>
  );
}
