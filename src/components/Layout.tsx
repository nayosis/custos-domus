import { useEffect, useState } from "react";
import {
  Alert, AppShell, Badge, Box, Burger, Button, Divider, Drawer, Group, Menu, Modal, NavLink, PasswordInput, Stack, Text, UnstyledButton, SegmentedControl, useMantineColorScheme,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandGithub, IconChevronUp, IconDatabaseExport, IconDots, IconHistory, IconHome, IconKey, IconLayoutDashboard, IconLogout, IconPackage, IconTool, IconUserCog } from "@tabler/icons-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { appelApi } from "../lib/rpc";
import { deconnexion, estAdmin, LIBELLES_ROLES, utilisateur } from "../lib/session";
import { useEvenements } from "../hooks/useEvenements";
import { useEcran } from "../lib/ecran";
import { configuration } from "../lib/configuration";
import { DEPOT_URL } from "../lib/versions";
import { BadgeMiseAJour } from "./MiseAJour";
import { Logo } from "./Logo";

/** `court` : libellé de la barre du bas, sur téléphone. */
type Entree = { to: string; label: string; court?: string; icone: typeof IconHome; actif: (p: string) => boolean };

const ENTREES: Entree[] = [
  { to: "/", label: "Tableau de bord", court: "Accueil", icone: IconLayoutDashboard, actif: (p) => p === "/" },
  { to: "/maisons", label: "Maisons", icone: IconHome, actif: (p) => p.startsWith("/maisons") },
  { to: "/elements", label: "Éléments", icone: IconPackage, actif: (p) => p.startsWith("/elements") },
  { to: "/prestataires", label: "Prestataires", court: "Artisans", icone: IconTool, actif: (p) => p.startsWith("/prestataires") },
];

const ENTREES_ADMIN: Entree[] = [
  { to: "/comptes", label: "Comptes", icone: IconUserCog, actif: (p) => p.startsWith("/comptes") },
  { to: "/journal", label: "Journal", icone: IconHistory, actif: (p) => p.startsWith("/journal") },
  { to: "/sauvegarde", label: "Sauvegarde", icone: IconDatabaseExport, actif: (p) => p.startsWith("/sauvegarde") },
];

/** Liens du menu, dans l'ordre (les admins ont en plus Comptes, Journal, Sauvegarde). */
const liens = (): Entree[] => (estAdmin() ? [...ENTREES, ...ENTREES_ADMIN] : ENTREES);

function ModalMotDePasse({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const valider = async () => {
    setErreur(null);
    try {
      await appelApi("/api/auth/mot-de-passe", { corps: { actuel, nouveau } });
      notifications.show({ color: "green", message: "Mot de passe changé" });
      setActuel("");
      setNouveau("");
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Changer de mot de passe">
      <Stack>
        {erreur && <Alert color="red">{erreur}</Alert>}
        <PasswordInput label="Mot de passe actuel" autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.currentTarget.value)} data-autofocus />
        <PasswordInput
          label="Nouveau mot de passe"
          description="10 caractères au moins"
          autoComplete="new-password"
          value={nouveau}
          onChange={(e) => setNouveau(e.currentTarget.value)}
        />
        <Button onClick={valider} disabled={nouveau.length < 10 || !actuel}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

/** Thème clair, sombre, ou celui du système (mémorisé sur l'appareil). */
function ChoixTheme() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Box px="sm" py={6}>
      <Text size="xs" c="dimmed" mb={4}>
        Thème
      </Text>
      <SegmentedControl
        size="xs"
        fullWidth
        value={colorScheme}
        onChange={(v) => setColorScheme(v as "light" | "dark" | "auto")}
        data={[
          { value: "light", label: "Clair" },
          { value: "dark", label: "Sombre" },
          { value: "auto", label: "Auto" },
        ]}
      />
    </Box>
  );
}

/** Compte connecté, en bas du menu : rôle, mot de passe, déconnexion. */
function MenuCompte() {
  const moi = utilisateur();
  const [mdp, setMdp] = useState(false);
  if (!moi) return null;
  return (
    <>
      <Menu position="top-start" width={240}>
        <Menu.Target>
          <UnstyledButton p="xs" style={{ borderRadius: 8, borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <Group gap="xs" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" fw={600} truncate>
                  {moi.email}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Badge size="xs" variant="light" color={moi.super ? "red" : "brique"}>
                    {moi.super ? "Super admin" : LIBELLES_ROLES[moi.role]}
                  </Badge>
                  {configuration().version && (
                    <Text size="xs" c="dimmed">
                      v{configuration().version}
                    </Text>
                  )}
                  <BadgeMiseAJour />
                </Group>
              </Stack>
              <IconChevronUp size={14} />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBrandGithub size={14} />} component="a" href={DEPOT_URL} target="_blank" rel="noopener noreferrer">
            Code source et nouvelles versions
          </Menu.Item>
          <ChoixTheme />
          <Menu.Divider />
          <Menu.Item leftSection={<IconKey size={14} />} onClick={() => setMdp(true)}>
            Changer de mot de passe
          </Menu.Item>
          <Menu.Item leftSection={<IconLogout size={14} />} onClick={() => deconnexion()}>
            Se déconnecter
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ModalMotDePasse opened={mdp} onClose={() => setMdp(false)} />
    </>
  );
}

function Marque() {
  return (
    <Group gap={8} wrap="nowrap">
      <Logo taille={26} />
      <Text fw={600} ff="heading" size="lg">
        Custos Domus
      </Text>
    </Group>
  );
}

function Liens({ chemin, surClic }: { chemin: string; surClic?: () => void }) {
  return (
    <>
      {liens().map((e) => (
        <NavLink key={e.to} component={Link} to={e.to} label={e.label} leftSection={<e.icone size={18} />} active={e.actif(chemin)} onClick={surClic} />
      ))}
    </>
  );
}

/** Téléphone : les pages les plus utiles en bas de l'écran, le reste dans « Plus ». */
function BarreBas({ chemin, onPlus }: { chemin: string; onPlus: () => void }) {
  const bouton = (contenu: React.ReactNode, actif: boolean) => (
    <Stack gap={2} align="center" c={actif ? "brique.6" : "dimmed"} py={6} style={{ flex: 1 }}>
      {contenu}
    </Stack>
  );
  return (
    <Group
      gap={0}
      wrap="nowrap"
      bg="var(--t-surface)"
      style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0 }}
    >
      {ENTREES.map((e) => (
        <UnstyledButton key={e.to} component={Link} to={e.to} style={{ flex: 1 }}>
          {bouton(
            <>
              <e.icone size={22} />
              <Text size="xs">{e.court ?? e.label}</Text>
            </>,
            e.actif(chemin),
          )}
        </UnstyledButton>
      ))}
      <UnstyledButton onClick={onPlus} style={{ flex: 1 }}>
        {bouton(
          <>
            <IconDots size={22} />
            <Text size="xs">Plus</Text>
          </>,
          false,
        )}
      </UnstyledButton>
    </Group>
  );
}

export function Layout() {
  const chemin = useRouterState({ select: (s) => s.location.pathname });
  const { type } = useEcran();
  const [menu, setMenu] = useState(false);
  useEvenements();
  // Changement de page : on referme le menu.
  useEffect(() => setMenu(false), [chemin]);

  if (type === "ordinateur") {
    return (
      <AppShell navbar={{ width: 220, breakpoint: 0 }} padding={0} h="100%">
        <AppShell.Navbar p="sm" bg="var(--t-fond-menu)" style={{ display: "flex", flexDirection: "column" }}>
          <Stack gap={4} style={{ flex: 1 }}>
            <Box px="xs" pb="md" pt={4}>
              <Marque />
            </Box>
            <Liens chemin={chemin} />
          </Stack>
          <MenuCompte />
        </AppShell.Navbar>
        <AppShell.Main h="100dvh" style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    );
  }

  // Tablette et téléphone : le menu complet dans un tiroir.
  const tiroir = (
    <Drawer opened={menu} onClose={() => setMenu(false)} size={type === "telephone" ? "85%" : 260} title={<Marque />} padding="sm">
      <Stack gap={4} h="100%">
        <Liens chemin={chemin} surClic={() => setMenu(false)} />
        <Divider my="sm" />
        <MenuCompte />
      </Stack>
    </Drawer>
  );
  const titre = liens().find((e) => e.actif(chemin))?.label ?? "";

  return (
    <Box h="100dvh" style={{ display: "flex", flexDirection: "column" }}>
      {type === "tablette" && (
        <Group h={52} px="sm" gap="sm" wrap="nowrap" bg="var(--t-fond-menu)" style={{ borderBottom: "1px solid var(--mantine-color-default-border)", flexShrink: 0 }}>
          <Burger opened={menu} onClick={() => setMenu((o) => !o)} size="sm" aria-label="Menu" />
          <Marque />
          <Text c="dimmed" size="sm" truncate style={{ flex: 1 }}>
            {titre}
          </Text>
        </Group>
      )}
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <Outlet />
      </Box>
      {type === "telephone" && <BarreBas chemin={chemin} onPlus={() => setMenu(true)} />}
      {tiroir}
    </Box>
  );
}
