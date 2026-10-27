import { createTheme, type MantineColorsTuple } from "@mantine/core";

/*
 * Patte graphique : chaleureuse, loin du vert de Tabularium. Terre cuite (brique) pour l'action,
 * fonds crème et sable, sombre brun plutôt que gris bleuté.
 */
const brique: MantineColorsTuple = ["#fdf2ee", "#f9e2d9", "#f2c2b0", "#eba085", "#e48361", "#df704a", "#d4603a", "#bb522f", "#a54828", "#8f3d21"];

/** Gris chauds (mode sombre) : du sable clair au brun presque noir. */
const dark: MantineColorsTuple = ["#e0d9d2", "#c4bab0", "#9c9187", "#776d64", "#544b44", "#3f3832", "#2f2a26", "#25211e", "#1d1a17", "#151311"];

export const theme = createTheme({
  primaryColor: "brique",
  primaryShade: { light: 6, dark: 5 },
  colors: { brique, dark },
  defaultRadius: "md",
  fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
  headings: { fontFamily: "Georgia, Cambria, 'Times New Roman', serif", fontWeight: "600" },
});
