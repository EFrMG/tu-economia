import { pageMeta } from "~/lib/meta";
import { SUPPORT_EMAIL } from "~/lib/support";

export function meta() {
  return pageMeta({
    title: "Privacidad",
    description:
      "Tratamiento de datos personales, uso de fuentes externas, proveedores de infraestructura y derechos de los usuarios en Tu Economía.",
    path: "/privacy",
  });
}

const sectionClass = "border-base-700 border-t pt-8";

export default function Privacy() {
  return (
    <section className="page-container max-w-3xl py-16 sm:py-24">
      <header className="stack-4 border-b border-base-700 pb-10">
        <h1 className="font-heading text-headline-lg text-text-100">
          Privacidad
        </h1>
        <p className="max-w-2xl text-body-lg text-text-300">
          Esta página describe de forma transparente cómo se recopilan, usan,
          conservan y protegen los datos personales en Tu Economía.
        </p>
        <p className="font-mono text-data-label text-text-400">
          Última actualización: 4 de noviembre de 2026
        </p>
      </header>

      <div className="mt-10 stack-10">
        <section aria-labelledby="principles-title">
          <h2
            id="principles-title"
            className="font-heading text-headline-md text-text-100"
          >
            Principios generales
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Tu Economía está diseñada bajo el principio de minimización de
              datos: solo se solicitan y procesan los datos estrictamente
              necesarios para prestar el servicio.
            </p>
            <p>
              No comercializamos datos personales, no elaboramos perfiles de
              usuario ni incluimos servicios de publicidad o rastreo de terceros
              en ninguna sección de la aplicación.
            </p>
          </div>
        </section>

        <section
          className={sectionClass}
          aria-labelledby="data-collected-title"
        >
          <h2
            id="data-collected-title"
            className="font-heading text-headline-md text-text-100"
          >
            Datos recopilados y finalidad
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las secciones públicas, las cotizaciones e indicadores de mercado
              pueden utilizarse libremente sin necesidad de registrarse. Para
              guardar información en la sección Mi economía se requiere una
              cuenta y una suscripción activa.
            </p>

            <div className="mt-2 stack-2">
              <h3 className="font-medium text-text-200">
                Datos de cuenta y autenticación
              </h3>
              <p>
                Al crear una cuenta se almacena su correo electrónico. Si accede
                mediante Google, recibimos el nombre y la foto de perfil
                compartidos por ese proveedor. Para gestionar las sesiones de
                forma segura, se guarda la dirección IP y el navegador
                utilizado. Los enlaces de acceso por correo (magic links) se
                almacenan como hash, sirven una sola vez y vencen tras cinco
                minutos.
              </p>
            </div>

            <div className="mt-2 stack-2">
              <h3 className="font-medium text-text-200">
                Registros financieros de Mi economía
              </h3>
              <p>
                Los sueldos mensuales, categorías de presupuesto, gastos y sus
                descripciones, pagos previstos y metas de ahorro que usted
                ingresa se guardan en la base de datos vinculados a su cuenta.
                Se utilizan exclusivamente para calcular sus totales y
                presentarle su panel personal.
              </p>
            </div>

            <div className="mt-2 stack-2">
              <h3 className="font-medium text-text-200">
                Suscripción y facturación
              </h3>
              <p>
                Los cobros son procesados directamente por Mercado Pago. Tu
                Economía no almacena ni recibe datos de tarjetas de crédito o
                débito. Únicamente conservamos los identificadores de la
                suscripción y de los pagos, los importes, las fechas y el estado
                de los cobros para habilitar el acceso a la cuenta y conciliar
                las facturaciones.
              </p>
            </div>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="storage-title">
          <h2
            id="storage-title"
            className="font-heading text-headline-md text-text-100"
          >
            Navegador, cookies y almacenamiento local
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Al iniciar sesión se guardan únicamente cookies técnicas
              necesarias para autenticar y mantener activa su sesión. Estas
              cookies no contienen sus registros financieros.
            </p>
            <p>
              El sitio no instala cookies de análisis, publicidad o seguimiento.
              Si utiliza la consulta de precios de consumo, sus selecciones de
              localidad y productos se guardan localmente en su navegador (
              <code className="font-mono text-text-200">localStorage</code>)
              para su conveniencia. Al consultar precios, esa selección se envía
              a nuestro servidor para obtener las cotizaciones y no se vincula a
              su cuenta.
            </p>
            <p>
              Los parámetros de la dirección web (como el período de un gráfico,
              el mes consultado o el importe que usted escribe en una
              calculadora) se usan solo para reproducir esa vista. No se
              vinculan a su cuenta, pero quedan en el historial del navegador:
              no comparta una dirección que incluya un importe si no desea
              exponerlo.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="providers-title">
          <h2
            id="providers-title"
            className="font-heading text-headline-md text-text-100"
          >
            Proveedores de servicios y fuentes externas
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las consultas a fuentes públicas de mercado (Dólar API,
              ArgentinaDatos, Datos Argentina, canales RSS de noticias y la API
              no oficial de Precios Claros) se efectúan de forma centralizada
              desde nuestro servidor. Su navegador no se comunica directamente
              con esos proveedores externos para cargar los paneles.
            </p>
            <p>
              Para operar la infraestructura del servicio, compartimos datos
              estrictamente necesarios con los siguientes proveedores:
            </p>
            <dl className="grid gap-4 border border-base-700 bg-surface-950 p-4 sm:grid-cols-2">
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Alojamiento y Base de Datos
                </dt>
                <dd>Cloudflare, Inc. (Workers y Cloudflare D1)</dd>
              </div>
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Procesamiento de Pagos
                </dt>
                <dd>MercadoPago S.A.</dd>
              </div>
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Envío de Correos
                </dt>
                <dd>Resend, Inc. (enlaces mágicos y avisos del servicio)</dd>
              </div>
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Autenticación Opcional
                </dt>
                <dd>Google LLC (en inicio de sesión con Google)</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="retention-title">
          <h2
            id="retention-title"
            className="font-heading text-headline-md text-text-100"
          >
            Conservación y eliminación de datos
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Sus registros de Mi economía se conservan mientras mantenga una
              suscripción activa.
            </p>
            <p>
              Si su suscripción finaliza, dispondrá de un período de tres meses
              para consultar, exportar en formato JSON o eliminar sus registros.
              Le enviaremos un aviso por correo electrónico a los dos meses. Si
              la suscripción no se reactiva, los registros se eliminan un mes
              después de ese aviso, aunque el correo no haya podido entregarse.
            </p>
            <p>
              Si decide eliminar su cuenta desde la sección Usuario de Mi
              economía, se borrarán de forma inmediata la cuenta, sus sesiones
              activas y la totalidad de sus registros financieros. Los registros
              de suscripción e historial de pagos se conservan con posterioridad
              únicamente para cumplir obligaciones contables y fiscales
              aplicables.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="rights-title">
          <h2
            id="rights-title"
            className="font-heading text-headline-md text-text-100"
          >
            Derechos del usuario y responsable legal
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              La normativa argentina (Ley N° 25.326 de Protección de Datos
              Personales) reconoce sus derechos de acceso, rectificación,
              actualización y supresión de sus datos personales.
            </p>
            <p>
              Puede consultar, exportar o borrar sus registros y eliminar su
              cuenta directamente desde la sección Usuario de Mi economía. Para
              cualquier otra solicitud o consulta legal, puede comunicarse con
              el responsable.
            </p>

            <dl className="my-2 grid gap-4 border border-base-700 bg-surface-950 p-4 sm:grid-cols-2">
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Responsable de la Base de Datos
                </dt>
                <dd>Erwin Francisco Macias Ghiglione</dd>
              </div>
              <div className="stack-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Domicilio de contacto
                </dt>
                <dd>Buenos Aires, Argentina</dd>
              </div>
              <div className="stack-2 sm:col-span-2">
                <dt className="font-mono text-label-caps text-text-200 uppercase">
                  Correo de contacto
                </dt>
                <dd>{SUPPORT_EMAIL}</dd>
              </div>
            </dl>

            <p className="border-l-2 border-base-700 py-1 pl-4 text-body-sm text-text-400 italic">
              La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de
              Órgano de Control de la Ley N° 25.326, tiene la atribución de
              atender las denuncias y reclamos que interpongan quienes resulten
              afectados en sus derechos por incumplimiento de las normas
              vigentes en materia de protección de datos personales.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
