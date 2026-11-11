import { useRef, useState } from "react";
import { Button } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";
import { HeroBlockField } from "~/components/features/HeroBlockField";
import { SupportDialog } from "~/components/features/SupportDialog";
import { Navbar } from "~/components/layout/Navbar";
import { pageMeta } from "~/lib/meta";
import { motion, useScroll, useTransform } from "motion/react";
import {
  HiOutlineBriefcase,
  HiOutlineCheckCircle,
  HiOutlineCollection,
  HiOutlineCurrencyDollar,
  HiOutlineNewspaper,
  HiOutlinePresentationChartLine,
  HiOutlineTerminal,
} from "react-icons/hi";

export function meta() {
  return pageMeta({
    description:
      "Cotizaciones del dólar, indicadores, análisis histórico, empresas, noticias y un registro personal de sueldo y gastos, con fuentes y metodología documentadas.",
    path: "/",
  });
}

export default function Home() {
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative isolate min-h-svh overflow-hidden">
        <HeroBlockField />
        <div className="pointer-events-none relative z-20">
          <Navbar onSupport={() => setSupportOpen(true)} />
        </div>
        <div className="page-container marketing-hero-content pointer-events-none relative z-10 flex flex-col gap-24 pt-32 pb-24 lg:pb-48">
          <div className="stack-6 items-center">
            <h1 className="marketing-hero-title text-center font-heading text-marketing-display text-text-100">
              El mercado argentino.
            </h1>
            <p className="block max-w-2xl text-center text-body-lg text-text-300 md:text-marketing-lead">
              <span>Cotizaciones, indicadores, empresas y noticias.</span>{" "}
              <br />
              <span>Registre sus ahorros y gastos en un solo lugar.</span>
              <br /> <span>Información clara en un contexto volátil.</span>
            </p>
          </div>

          <div className="marketing-hero-actions mx-auto flex flex-col gap-8 sm:flex-row">
            <Button
              href="/dashboard"
              size="lg"
              className="pointer-events-auto h-16 gap-2.5 px-5! text-body-lg"
            >
              <span className="text-inherit [text-box:trim-both_cap_alphabetic]">
                Dashboard
              </span>
              <HiOutlineTerminal
                aria-hidden="true"
                className="-mr-[0.2em] size-[2cap]"
              />
            </Button>
            <Button
              variant="outline"
              size="lg"
              href="/mi-economia"
              className="pointer-events-auto h-16 px-8 text-body-lg"
            >
              Mi economía
            </Button>
          </div>
        </div>
      </section>

      {/* Animated Modules Section */}
      <section className="relative z-10 mt-40 bg-base-950 lg:mt-72">
        <div className="page-container pb-24">
          <div className="stack-12 lg:stack-48">
            <ScrollFeature
              id="Dólar"
              title="Cotizaciones del dólar"
              description="Las cinco referencias del mercado en una sola pantalla, con su evolución reciente y la brecha contra el Oficial."
              points={[
                "Blue, Oficial, MEP, CCL y Cripto",
                "Compra, venta, variación diaria y brecha",
                "Cierres y brecha Blue–Oficial de 7, 30 o 90 días",
                "Conversor de pesos y dólares",
              ]}
              icon={<HiOutlineCurrencyDollar />}
            />
            <ScrollFeature
              id="Indicadores"
              title="Inflación e indicadores"
              description="Inflación, tasas, UVA, riesgo país y actividad económica."
              points={[
                "Inflación mensual e interanual",
                "Depósitos a 30 días, UVA y riesgo país",
                "EMAE: variación interanual y mensual desestacionalizada",
                "Equivalencia de un monto según el IPC",
                "Retorno real frente a la inflación",
              ]}
              icon={<HiOutlinePresentationChartLine />}
              reverse
            />
            <ScrollFeature
              id="Empresas"
              title="Empresas y CEDEARs"
              description="Las compañías argentinas que cotizan en los Estados Unidos, con sus informes ante la SEC y una calculadora del precio teórico de un CEDEAR."
              points={[
                "Informe anual, presentaciones recientes y cifras informadas",
                "Enlaces directos a los documentos",
                "Precio teórico con CCL o MEP",
              ]}
              icon={<HiOutlineBriefcase />}
            />
            <ScrollFeature
              id="Noticias"
              title="Noticias económicas"
              description="Titulares recientes de medios argentinos. El dashboard muestra un avance de las últimas noticias."
              points={[
                "iProfesional, Clarín y Página/12",
                "Enlace directo a cada publicación original",
              ]}
              icon={<HiOutlineNewspaper />}
              reverse
            />
            <ScrollFeature
              id="Mi economía"
              title="Sueldo, gastos y precios"
              description="Registre su sueldo y presupuesto; anote sus gastos y pagos. Compare además los precios de productos habituales entre los comercios de su ciudad."
              points={[
                "Ingreso mensual, presupuesto y gastos por categoría",
                "Próximos pagos y metas de ahorro",
                "Precios de consumo por ciudad y cadena",
              ]}
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
                <h2 className="font-heading text-headline-lg text-text-100 md:text-marketing-section">
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
          <h2 className="font-heading text-headline-lg text-text-100 md:text-marketing-feature">
            Inicie su terminal personal.
          </h2>
        </div>

        <Button
          href="/dashboard"
          size="lg"
          className="h-24 gap-4 pr-8 pl-8 text-body-lg md:text-marketing-lead"
        >
          <span className="text-inherit [text-box:trim-both_cap_alphabetic]">
            Abrir Dashboard
          </span>
          <HiOutlineTerminal
            aria-hidden="true"
            className="-mr-[0.2em] size-[2cap]"
          />
        </Button>
      </section>

      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

function ScrollFeature({
  id,
  title,
  description,
  points,
  icon,
  reverse = false,
}: {
  id: string;
  title: string;
  description: string;
  points: string[];
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
              <h3 className="font-heading text-headline-lg text-text-100 md:text-marketing-feature">
                {title}
              </h3>
            </div>

            <div className="stack-4">
              <p className="max-w-lg text-body-lg text-text-300 md:text-marketing-lead">
                {description}
              </p>

              <ul className="grid max-w-lg gap-2">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-body-sm text-text-300"
                  >
                    <span
                      className="mt-2 h-1 w-1 shrink-0 bg-primary-500"
                      aria-hidden="true"
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
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
