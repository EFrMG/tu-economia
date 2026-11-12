import { Link } from "react-router";

import { pageMeta } from "~/lib/meta";
import { SUPPORT_EMAIL, SUPPORT_MAILTO_URL } from "~/lib/support";

export function meta() {
  return pageMeta({
    title: "Términos del servicio",
    description:
      "Condiciones de la suscripción a Tu Economía: precio, mes gratis, cobro, cancelación, período de solo lectura y conservación de los registros, y uso permitido de los datos del servicio.",
    path: "/terms",
  });
}

const sectionClass = "border-base-700 border-t pt-8";

export default function Terms() {
  return (
    <section className="page-container max-w-3xl py-16 sm:py-24">
      <header className="stack-4 border-b border-base-700 pb-10">
        <h1 className="font-heading text-headline-lg text-text-100">
          Términos del servicio
        </h1>
        <p className="max-w-2xl text-body-lg text-text-300">
          Estas condiciones describen el alcance del servicio, el precio de la
          suscripción, cómo se cobra, qué ocurre con sus registros cuando
          finaliza y qué uso puede darse a los datos del servicio.
        </p>
        <p className="font-mono text-data-label text-text-400">
          Última actualización: 12 de noviembre de 2026
        </p>
      </header>

      <div className="mt-8 stack-10">
        <section aria-labelledby="scope-title">
          <h2
            id="scope-title"
            className="font-heading text-headline-md text-text-100"
          >
            Objeto y aceptación
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Tu Economía es un servicio de información económica para
              Argentina. Las secciones públicas —cotizaciones, indicadores,
              noticias y documentación— pueden utilizarse sin cuenta. La edición
              de los registros de Mi economía en su cuenta requiere una cuenta y
              una suscripción activa.
            </p>
            <p>
              Estos términos rigen esa suscripción. La sección «Interfaces y
              datos del servicio» se aplica además a cualquier persona que
              acceda al servicio, tenga o no una cuenta. Al marcar la aceptación
              y continuar en Mercado Pago, usted confirma que los leyó y los
              acepta. Si no está de acuerdo, no complete la inscripción.
            </p>
            <p>
              El tratamiento de datos personales se describe en la{" "}
              <Link
                to="/privacy"
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                política de privacidad
              </Link>
              , donde también se identifica el responsable del servicio.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="service-title">
          <h2
            id="service-title"
            className="font-heading text-headline-md text-text-100"
          >
            Descripción del servicio
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las cotizaciones, los indicadores y las noticias provienen de
              fuentes públicas y se ofrecen con fines informativos. Los datos
              son referenciales y no constituyen asesoría financiera, impositiva
              ni legal.
            </p>
            <p>
              La suscripción habilita guardar, editar, exportar y eliminar
              registros personales de Mi economía. Cuando la suscripción
              termina, el acceso de solo lectura, la exportación y la
              eliminación siguen disponibles durante el período descrito más
              abajo.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="price-title">
          <h2
            id="price-title"
            className="font-heading text-headline-md text-text-100"
          >
            Plan, precio y mes gratuito
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              El primer mes es gratis: la primera suscripción de una cuenta
              incluye un mes calendario sin cargo. Vencido ese mes, el precio es
              de ARS 5.000 por mes, con renovación automática y cobro mensual a
              través de Mercado Pago.
            </p>
            <p>
              Una suscripción de reemplazo, contratada después de una
              cancelación o de un vencimiento, no incluye otro mes gratis: el
              primer cobro se realiza al autorizar el medio de pago.
            </p>
            <p>
              Tu Economía no recibe ni almacena los datos de su tarjeta. Mercado
              Pago procesa el cobro y la autorización de renovación.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="charge-title">
          <h2
            id="charge-title"
            className="font-heading text-headline-md text-text-100"
          >
            Cobro y renovación
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Al inscribirse, autoriza a Mercado Pago a debitar ARS 5.000 cada
              mes hasta que cancele la suscripción. El primer débito ocurre al
              finalizar el primer mes gratis o, en una suscripción de reemplazo,
              al autorizar el medio de pago.
            </p>
            <p>
              Si un cobro no se completa, el acceso no se extiende: la edición
              se detiene al terminar el último período gratuito o pagado. No
              existe un período de gracia.
            </p>
            <p>
              El detalle y los comprobantes de cada cobro quedan disponibles en
              su cuenta de Mercado Pago.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="cancel-title">
          <h2
            id="cancel-title"
            className="font-heading text-headline-md text-text-100"
          >
            Cancelación y arrepentimiento
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Puede cancelar la renovación en cualquier momento desde Mi
              economía o escribiendo a{" "}
              <a
                href={SUPPORT_MAILTO_URL}
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              . La cancelación detiene el próximo cobro y conserva el acceso
              hasta el final del mes gratuito o del período ya pagado.
            </p>
            <p>
              La cancelación no genera el reintegro del período en curso. Si
              canceló dentro de un período pagado, conserva el acceso hasta su
              final.
            </p>
            <p>
              La Ley N.º 24.240 reconoce el derecho de arrepentimiento dentro de
              los diez días de contratado el servicio. En la primera
              suscripción, el mes gratuito cubre ese plazo: si cancela antes de
              que termine, no se realiza ningún cobro. En una suscripción de
              reemplazo, sin mes gratuito, escriba a{" "}
              <a
                href={SUPPORT_MAILTO_URL}
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              dentro de ese plazo para solicitar el reintegro del período no
              utilizado.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="retention-title">
          <h2
            id="retention-title"
            className="font-heading text-headline-md text-text-100"
          >
            Período de solo lectura y conservación
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Cuando la suscripción termina, la cuenta conserva el acceso de
              solo lectura durante tres meses. En ese período puede consultar,
              exportar sus registros en formato JSON o eliminarlos, pero no
              puede modificarlos.
            </p>
            <p>
              A los dos meses enviamos un aviso al correo de la cuenta. Si la
              suscripción no se reactiva, los registros de Mi economía se
              eliminan un mes después de ese aviso, aunque el correo no haya
              podido entregarse.
            </p>
            <p>
              Si elimina la cuenta desde Mi economía, se borran de inmediato la
              cuenta, sus sesiones y sus registros financieros. Los
              identificadores de la suscripción y el historial de pagos se
              conservan para cumplir obligaciones contables y fiscales.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="use-title">
          <h2
            id="use-title"
            className="font-heading text-headline-md text-text-100"
          >
            Uso aceptable
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              La cuenta es personal. Usted es responsable de mantener la
              confidencialidad del acceso y de la veracidad del correo
              declarado.
            </p>
            <p>
              No está permitido compartir la cuenta para evitar el pago,
              automatizar consultas de forma abusiva, interferir con el servicio
              ni utilizarlo para fines ilícitos. Podemos suspender cuentas que
              incumplan estas condiciones.
            </p>
            <p>
              Los registros que usted ingresa son suyos. Nos autoriza a
              almacenarlos y procesarlos únicamente para prestar el servicio.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="interfaces-title">
          <h2
            id="interfaces-title"
            className="font-heading text-headline-md text-text-100"
          >
            Interfaces y datos del servicio
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las direcciones que comienzan con /api/ y /resources/, y las
              respuestas de datos que cargan las páginas, son interfaces
              internas de Tu Economía. Existen únicamente para mostrar el
              contenido del propio servicio: no constituyen una API pública ni
              se ofrecen para su uso por terceros.
            </p>
            <p>
              No está permitido utilizar esas interfaces, ni los datos que
              entregan, para mostrar, reproducir o redistribuir información
              fuera de Tu Economía, ya sea en otros sitios, aplicaciones,
              widgets, bots o servicios, con o sin fines comerciales. Tampoco
              está permitido obtener el contenido de las páginas por medios
              automatizados con ese fin.
            </p>
            <p>
              Las cotizaciones, los indicadores y las noticias provienen de
              fuentes públicas que tienen sus propias condiciones de uso. Si
              necesita esos datos para otro fin, consúltelos directamente en las
              fuentes que se detallan en la{" "}
              <Link
                to="/docs"
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                documentación
              </Link>
              .
            </p>
            <p>
              Podemos limitar o bloquear el acceso que incumpla estas
              condiciones.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="availability-title">
          <h2
            id="availability-title"
            className="font-heading text-headline-md text-text-100"
          >
            Disponibilidad y cambios
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              El servicio se ofrece tal como está disponible. Las fuentes
              públicas pueden fallar o demorar, y no garantizamos que la
              información esté siempre completa ni que el servicio funcione sin
              interrupciones.
            </p>
            <p>
              Podemos modificar o discontinuar funciones. Si un cambio afecta el
              precio o estas condiciones, lo comunicamos al correo de la cuenta
              antes de que se aplique.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="contact-title">
          <h2
            id="contact-title"
            className="font-heading text-headline-md text-text-100"
          >
            Responsable, contacto y ley aplicable
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Para consultas sobre la suscripción, la facturación o estos
              términos, escriba a{" "}
              <a
                href={SUPPORT_MAILTO_URL}
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <p>
              Estos términos se rigen por las leyes de la República Argentina.
              El domicilio de contacto se indica en la{" "}
              <Link
                to="/privacy"
                className="text-primary-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
              >
                política de privacidad
              </Link>
              , junto con los derechos que reconoce la Ley N.º 25.326.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
