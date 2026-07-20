import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Layout } from "./components/Layout.tsx";
import { Campaigns } from "./routes/Campaigns.tsx";
import { Dashboard } from "./routes/Dashboard.tsx";
import { Diagnosis } from "./routes/Diagnosis.tsx";
import { Discovery } from "./routes/Discovery.tsx";
import { Functions } from "./routes/Functions.tsx";
import { Guide } from "./routes/Guide.tsx";
import { Journal } from "./routes/Journal.tsx";
import { ProblemDetail } from "./routes/ProblemDetail.tsx";

const rootRoute = createRootRoute({ component: Layout });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Dashboard }),
  createRoute({ getParentRoute: () => rootRoute, path: "/diagnosis", component: Diagnosis }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/problems/$problemId",
    component: ProblemDetail,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/discovery", component: Discovery }),
  createRoute({ getParentRoute: () => rootRoute, path: "/guide", component: Guide }),
  createRoute({ getParentRoute: () => rootRoute, path: "/functions", component: Functions }),
  createRoute({ getParentRoute: () => rootRoute, path: "/campaigns", component: Campaigns }),
  createRoute({ getParentRoute: () => rootRoute, path: "/journal", component: Journal }),
];

const routeTree = rootRoute.addChildren(routes);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
