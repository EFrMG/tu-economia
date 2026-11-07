import { Link } from "react-router";
import { Wordmark } from "~/components/ui/Wordmark";
import { SUPPORT_REPOSITORY_URL } from "~/lib/support";

const footerLinks = [
  { to: "/api-status", label: "Estado de API" },
  { to: "/docs", label: "Documentación" },
  { to: "/terms", label: "Términos" },
  { to: "/privacy", label: "Privacidad" },
];

export const Footer = () => {
  return (
    <footer className="page-container py-12">
      <div className="grid gap-12 md:grid-cols-12 md:items-start md:gap-8">
        <div className="stack-2 md:col-span-4">
          <h2>
            <Wordmark />
          </h2>
          <p className="max-w-xs text-body-sm text-text-300">
            Cotizaciones y noticias económicas de Argentina.
          </p>
        </div>

        <nav
          aria-label="Enlaces del pie de página"
          className="flex flex-wrap gap-x-8 gap-y-4 font-mono text-data-label uppercase md:col-span-4 md:justify-self-center"
        >
          {footerLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="text-text-300 transition-colors focus-visible:outline-none hocus:text-primary-text-100"
            >
              {label}
            </Link>
          ))}
          <a
            href={SUPPORT_REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-300 transition-colors focus-visible:outline-none hocus:text-primary-text-100"
          >
            GitHub
          </a>
        </nav>

        <p className="max-w-md border border-tertiary-500/20 bg-tertiary-500/5 p-4 font-mono text-label-caps text-tertiary-text-200 uppercase md:col-span-4 md:justify-self-end">
          Atención: los datos provistos son referenciales y no constituyen
          asesoría financiera.
        </p>
      </div>
    </footer>
  );
};
