import { MdFavorite, MdOutlineFavoriteBorder } from "react-icons/md";
import { Link } from "react-router";
import { SiGithub } from "react-icons/si";

import { Wordmark } from "~/components/ui/Wordmark";
import { SUPPORT_REPOSITORY_URL } from "~/lib/support";

interface NavbarProps {
  onSupport?: () => void;
}

export const Navbar = ({ onSupport }: NavbarProps) => {
  return (
    <nav className="page-container marketing-navbar flex items-center justify-between py-8">
      <Link
        to="/"
        className="pointer-events-auto transition-opacity focus-visible:outline-none hocus:opacity-80"
      >
        <Wordmark homepage={true} />
      </Link>

      <div className="flex items-center gap-6">
        {onSupport && (
          <button
            type="button"
            onClick={onSupport}
            aria-label="Abrir soporte"
            aria-haspopup="dialog"
            className="group pointer-events-auto grid size-8 shrink-0 place-items-center p-0 text-red-text-400 transition-colors focus-visible:outline-none hocus:text-red-text-300"
          >
            <MdOutlineFavoriteBorder
              aria-hidden="true"
              className="col-start-1 row-start-1 text-3xl transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0"
            />
            <MdFavorite
              aria-hidden="true"
              className="col-start-1 row-start-1 text-3xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </button>
        )}
        <a
          href={SUPPORT_REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver el repositorio en GitHub (se abre en una nueva pestaña)"
          className="pointer-events-auto inline-flex size-8 items-center justify-center text-primary-300 transition-colors focus-visible:outline-none hocus:text-primary-400"
        >
          <SiGithub aria-hidden="true" className="text-3xl" />
        </a>
      </div>
    </nav>
  );
};
