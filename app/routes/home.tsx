import { useRef } from "react";
import { Button } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";
import { HeroBlockField } from "~/components/features/HeroBlockField";
import { Navbar } from "~/components/layout/Navbar";
import { pageMeta } from "~/lib/meta";
import { motion, useScroll, useTransform } from "motion/react";
import {
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineCurrencyDollar,
  HiOutlineTrendingUp,
  HiOutlineCollection,
  HiOutlineTerminal,
} from "react-icons/hi";

export function meta() {
  return pageMeta({
    description:
      "Cotizaciones del dólar, evolución histórica y noticias económicas argentinas con fuentes y metodología documentadas.",
    path: "/",
  });
}

export default function Home() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative isolate min-h-svh overflow-hidden">
        <HeroBlockField />
        <div className="pointer-events-none relative z-20">
          <Navbar />
        </div>
        <div className="page-container marketing-hero-content pointer-events-none relative z-10 flex flex-col gap-24 pt-32 pb-24 lg:pb-48">
          <div className="stack-6 items-center">
            <h1 className="marketing-hero-title text-center font-heading text-marketing-display text-text-100">
              El mercado argentino.
            </h1>
            <p className="block max-w-2xl text-center text-body-lg text-text-300 md:text-marketing-lead">
              <span>Cotizaciones, noticias y evolución histórica.</span> <br />
              <span>Maneje sus ahorros y gastos en un solo lugar.</span>
              <br />{" "}
              <span>Nuestro santuario financiero en un contexto volátil.</span>
            </p>
          </div>

          <div className="marketing-hero-actions mx-auto flex flex-col gap-8 sm:flex-row">
            <Button
              href="/dashboard"
              size="lg"
              className="pointer-events-auto h-16 gap-3 px-8 text-body-lg"
            >
              Dashboard <HiOutlineArrowRight aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              href="/noticias"
              className="pointer-events-auto h-16 px-8 text-body-lg"
            >
              Ver noticias
            </Button>
          </div>
        </div>
      </section>

      {/* Animated Modules Section */}
      <section className="relative z-10 mt-40 bg-base-950 lg:mt-72">
        <div className="page-container pb-24">
          <div className="stack-12 lg:stack-48">
            <ScrollFeature
              id="Cotizaciones"
              title="Tipos de cambio"
              description="Compra, venta, variación diaria y brecha para Blue, Oficial, MEP, CCL y Cripto. Un conversor rápido permite estimar montos en ARS o USD con la cotización elegida."
              icon={<HiOutlineCurrencyDollar />}
            />
            <ScrollFeature
              id="Historial"
              title="Evolución histórica"
              description="El gráfico compara los cierres de venta de Blue y Oficial en períodos variables."
              icon={<HiOutlineTrendingUp />}
              reverse
            />
            <ScrollFeature
              id="Planificación personal"
              title="Sueldo y gastos"
              description="Registre su sueldo, organice un presupuesto por categorías y anticipe pagos. Sus registros se guardan en su cuenta; el primer mes no tiene cargo."
              icon={<HiOutlineCollection />}
            />
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="page-container py-24 lg:py-48">
        <div>
          <Card className="group relative grid items-center gap-12 overflow-hidden p-8 shadow-none md:grid-cols-2 md:p-24">
            <div className="relative z-10 stack-8">
              <div className="stack-2">
                <h2 className="font-heading text-marketing-section text-text-100">
                  Transparencia y Serenidad.
                </h2>
              </div>

              <p className="text-body-lg text-text-300">
                El ruido del mercado está diseñado para provocar ansiedad a
                corto plazo. Nuestro enfoque es técnico, hacia una conciencia
                futura. Sin notificaciones de pánico, solo datos crudos y bien
                estructurados.
              </p>

              <ul className="mt-8 ml-4 stack-4 font-mono text-base text-text-300 uppercase">
                <li className="flex items-center gap-[1ch]">
                  <HiOutlineCheckCircle
                    className="text-2xl text-primary-text-100"
                    aria-hidden="true"
                  />{" "}
                  Datos Oficiales
                </li>
                <li className="flex items-center gap-[1ch]">
                  <HiOutlineCheckCircle
                    className="text-2xl text-primary-text-100"
                    aria-hidden="true"
                  />{" "}
                  Sin Publicidad
                </li>
              </ul>
            </div>

            <div
              className="pointer-events-none absolute top-1/2 -right-24 -translate-y-1/2 scale-150 opacity-5 transition-opacity duration-1000 group-hover:opacity-10"
              aria-hidden="true"
            >
              <HiOutlineTerminal className="marketing-terminal-watermark text-text-100" />
            </div>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="stack-12 items-center border-t border-base-700/50 bg-linear-to-b from-transparent to-surface-900/30 px-4 py-24 text-center md:px-8 lg:py-48">
        <div className="stack-8 items-center">
          <h2 className="font-heading text-marketing-feature text-text-100">
            Inicie su terminal personal.
          </h2>
        </div>

        <Button
          href="/dashboard"
          size="lg"
          className="h-24 gap-6 px-16 text-marketing-lead"
        >
          Abrir Dashboard
          <HiOutlineTerminal aria-hidden="true" className="text-4xl" />
        </Button>
      </section>
    </div>
  );
}

function ScrollFeature({
  id,
  title,
  description,
  icon,
  reverse = false,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  reverse?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(
    scrollYProgress,
    [0, 0.42, 0.58, 1],
    [0.8, 1, 1, 0.8],
  );

  return (
    <section ref={ref} className="marketing-scroll-feature relative isolate">
      <div className="marketing-scroll-feature__content flex items-center">
        <motion.div
          style={{ scale }}
          className={`marketing-scroll-feature__scale relative z-10 flex w-full flex-col ${reverse ? "md:flex-row-reverse" : "md:flex-row"} items-center gap-8 py-12 md:gap-12`}
        >
          {/* Content */}
          <div className="relative z-10 stack-8 flex-1">
            <div className="stack-4">
              <h3 className="font-heading text-marketing-feature text-text-100">
                {title}
              </h3>
            </div>
            <p className="max-w-lg text-body-lg text-text-300 md:text-marketing-lead">
              {description}
            </p>

            <div
              className="mx-auto h-px w-2/3 bg-primary-500/50"
              aria-hidden="true"
            />
          </div>

          {/* Visual Representation (Mini version of icon) */}
          <div
            className="hidden flex-1 items-center justify-center gap-1 md:flex md:flex-col"
            aria-hidden="true"
          >
            <span className="font-mono text-label-caps text-primary-text-100 uppercase">
              {id}
            </span>
            <div className="relative flex h-64 w-64 items-center justify-center border border-base-700 bg-surface-950 text-9xl text-primary-text-100/20">
              {icon}

              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 h-6 w-6 border-t border-l border-primary-500/50"></div>
              <div className="absolute -right-1 -bottom-1 h-6 w-6 border-r border-b border-primary-500/50"></div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
