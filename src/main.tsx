import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "dayjs/locale/fr";
import "./styles.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { DatesProvider } from "@mantine/dates";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { theme } from "./theme";
import { queryClient } from "./lib/query";
import { chargerSession } from "./lib/session";
import { chargerConfiguration } from "./lib/configuration";

// Le compte connecté (et donc ses droits) est connu avant le premier affichage.
await Promise.all([
  chargerSession().catch((e) => console.error("Session illisible", e)),
  chargerConfiguration().catch((e) => console.error("Configuration illisible", e)),
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="bottom-right" />
      <QueryClientProvider client={queryClient}>
        <DatesProvider settings={{ locale: "fr", firstDayOfWeek: 1 }}>
          <ModalsProvider labels={{ confirm: "Confirmer", cancel: "Annuler" }}>
            <RouterProvider router={router} />
          </ModalsProvider>
        </DatesProvider>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
