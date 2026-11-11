import { Link } from "react-router";
import { SiGithub } from "react-icons/si";

import { Wordmark } from "~/components/ui/Wordmark";
import { SUPPORT_REPOSITORY_URL } from "~/lib/support";

export const Navbar = () => {
  return (
    <nav className="page-container marketing-navbar flex items-center justify-between py-8">
      <Link
        to="/"
        className="pointer-events-auto transition-opacity focus-visible:outline-none hocus:opacity-80"
      >
        <Wordmark homepage={true} />
      </Link>

      <div className="flex items-center gap-6">
        <a
          href={SUPPORT_REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver el repositorio en GitHub (se abre en una nueva pestaña)"
          className="pointer-events-auto text-primary-400 transition-colors focus-visible:outline-none hocus:text-primary-500"
        >
          <SiGithub aria-hidden="true" className="text-3xl" />
        </a>
      </div>
    </nav>
  );
};
