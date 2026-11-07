import { Link } from "react-router";
import { HiOutlineTerminal } from "react-icons/hi";

import { Button } from "~/components/ui/Button";
import { Wordmark } from "~/components/ui/Wordmark";

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
        <Button
          href="/dashboard"
          size="sm"
          className="pointer-events-auto gap-2"
        >
          <HiOutlineTerminal aria-hidden="true" className="text-lg" />
          Dashboard
        </Button>
      </div>
    </nav>
  );
};
