import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("robots.txt", "routes/robots.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("resources/inflation-history", "routes/inflation-history.ts"),
  route("resources/prices", "routes/prices-api.ts"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("api/finance-export", "routes/finance-export-api.ts"),
  route("api/account", "routes/account-api.ts"),
  route("api/billing", "routes/billing-api.ts"),
  route("api/billing/webhook", "routes/billing-webhook-api.ts"),
  layout("layouts/marketing.tsx", [
    index("routes/home.tsx"),
    route("api-status", "routes/api-status.tsx"),
    route("docs", "routes/docs.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("terms", "routes/terms.tsx"),
  ]),
  layout("layouts/terminal.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("dolar", "routes/dolar.tsx"),
    route("precios", "routes/precios.tsx"),
    route("tasas", "routes/tasas.tsx"),
    route("actividad", "routes/actividad.tsx"),
    route("acciones", "routes/acciones.tsx"),
    route("noticias", "routes/noticias.tsx"),
    route("mi-economia", "routes/mi-economia.tsx"),
  ]),
] satisfies RouteConfig;
