import { Link } from "react-router";

import { pageMeta } from "~/lib/meta";
import {
  ACTIVITY_CSV_URL,
  ACTIVITY_DATA_URL,
  ACTIVITY_METHOD_URL,
} from "~/lib/economic-activity";
import { PRICE_SOURCE_DATE } from "~/lib/prices";

export function meta() {
  return pageMeta({
    title: "Documentación",
    description:
      "Fuentes, cálculos, actualización y límites de los datos presentados en Tu Economía.",
    path: "/docs",
  });
}

const sourceLinkClass =
  "font-mono text-data-label text-primary-text-100 hocus:underline underline-offset-4 focus-visible:outline-none";

const sectionClass = "border-base-700 border-t pt-8";

const priceSourceDateLabel = PRICE_SOURCE_DATE.split("-").reverse().join("/");

export default function Docs() {
  return (
    <section className="page-container max-w-3xl py-16 sm:py-24">
      <header className="stack-4 border-b border-base-700 pb-10">
        <h1 className="font-heading text-headline-lg text-text-100">
          Documentación
        </h1>
        <p className="max-w-2xl text-body-lg text-text-300">
          Esta página explica el origen, el tratamiento y los límites de la
          información que se muestra en Tu Economía.
        </p>
      </header>

      <div className="mt-8 stack-10">
        <section aria-labelledby="sources-title">
          <h2
            id="sources-title"
            className="font-heading text-headline-md text-text-100"
          >
            Fuentes de cotizaciones
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las cotizaciones en vivo de dólar Oficial, Blue, MEP, CCL y Cripto
              se consultan en{" "}
              <a
                className={sourceLinkClass}
                href="https://dolarapi.com/docs/"
                target="_blank"
                rel="noreferrer"
              >
                Dólar API
              </a>
              . Los valores de compra y venta provienen de esa respuesta. La
              hora del panel corresponde a la actualización más reciente
              informada entre las cotizaciones recibidas.
            </p>
            <p>
              Los cierres históricos se consultan en{" "}
              <a
                className={sourceLinkClass}
                href="https://argentinadatos.com/"
                target="_blank"
                rel="noreferrer"
              >
                ArgentinaDatos
              </a>
              . El gráfico histórico utiliza las series de venta de Blue y
              Oficial.
            </p>
            <p className="text-text-400">
              Tu Economía presenta datos de estos proveedores; no determina ni
              certifica las cotizaciones.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="calculation-title">
          <h2
            id="calculation-title"
            className="font-heading text-headline-md text-text-100"
          >
            Cálculos mostrados
          </h2>
          <dl className="mt-4 stack-6">
            <div>
              <dt className="font-mono text-label-caps text-text-200 uppercase">
                Variación diaria
              </dt>
              <dd className="mt-2 text-body-sm text-text-300">
                Se calcula como (venta actual / último cierre anterior al día
                actual − 1) × 100. El día se determina en horario de Argentina.
                Si no hay un cierre previo válido, se informa como dato no
                disponible.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-label-caps text-text-200 uppercase">
                Brecha
              </dt>
              <dd className="mt-2 text-body-sm text-text-300">
                Se calcula como (venta de la cotización / venta Oficial − 1) ×
                100. En la tarjeta Oficial se informa la brecha Blue, usando la
                misma referencia.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-label-caps text-text-200 uppercase">
                Conversor rápido
              </dt>
              <dd className="mt-2 text-body-sm text-text-300">
                Para estimar USD desde ARS se divide el monto por el precio de
                venta elegido. Para estimar ARS desde USD se multiplica por el
                precio de compra. El resultado es orientativo y no incluye
                cargos o condiciones de una operación concreta.
              </dd>
            </div>
          </dl>
        </section>

        <section className={sectionClass} aria-labelledby="freshness-title">
          <h2
            id="freshness-title"
            className="font-heading text-headline-md text-text-100"
          >
            Actualización y disponibilidad
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las cotizaciones en vivo se conservan en memoria del servidor por
              hasta un minuto. Las consultas históricas se conservan por hasta
              diez minutos. Las solicitudes simultáneas reutilizan la misma
              consulta pendiente para cada fuente. Estos plazos regulan nuestras
              consultas; no indican cada cuánto actualiza sus datos el
              proveedor. Si falta alguna cotización esperada, ese resultado
              parcial se conserva como máximo cinco segundos para permitir una
              nueva consulta.
            </p>
            <p>
              En las páginas del terminal, el control Actualizar vuelve a
              consultar los datos de la página. Si alguna fuente no está
              disponible, la página intenta actualizarla cada cinco segundos
              mientras la pestaña está visible. Los reintentos se detienen
              cuando se recuperan todas las fuentes. Las respuestas válidas
              pueden seguir viniendo de la caché durante los plazos indicados.
            </p>
            <p>
              Si no se puede renovar una cotización en vivo, el panel puede
              mostrar el último resultado obtenido por este proceso durante un
              máximo de quince minutos. En ese caso se identifica que los
              valores no están actualizados e informa la hora de la última
              consulta exitosa. Si no hay un resultado reciente disponible, las
              cotizaciones no se muestran.
            </p>
            <p>
              El historial es complementario: una falla al consultarlo no impide
              mostrar las cotizaciones en vivo. En ese caso, las variaciones y
              los períodos sin cierres se informan como datos no disponibles.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="chart-title">
          <h2
            id="chart-title"
            className="font-heading text-headline-md text-text-100"
          >
            Períodos del gráfico
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              El gráfico permite ver 7, 30 o 90 días calendario. Cada selección
              incluye el día actual en Argentina y los días calendario
              anteriores necesarios para completar el período.
            </p>
            <p>
              Se conservan hasta 90 días calendario de cierres. Blue y Oficial
              se unen por fecha; cuando una fuente no informa un cierre para un
              día, esa observación queda ausente en su serie. El período elegido
              se guarda en la URL para poder compartirlo.
            </p>
            <p>
              En Análisis, el gráfico de brecha compara solo cierres Blue y
              Oficial de la misma fecha: (Blue / Oficial − 1) × 100. El cambio
              del período resta la primera brecha disponible de la última y se
              expresa en puntos porcentuales. Las fechas sin ambos cierres no se
              calculan ni se completan con valores de otros días. El período se
              guarda en la URL de ambas páginas.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="indicators-title">
          <h2
            id="indicators-title"
            className="font-heading text-headline-md text-text-100"
          >
            Indicadores económicos
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              La sección Indicadores muestra la inflación mensual y la variación
              interanual del IPC, la tasa nominal anual de depósitos a 30 días,
              el valor de la UVA y el riesgo país. También presenta el estimador
              mensual de actividad económica (EMAE). La inflación y la tasa se
              muestran como porcentajes, la UVA en pesos y el riesgo país en
              puntos básicos. Las cinco tarjetas presentan los valores tal como
              los informa cada serie, sin conversiones de escala o frecuencia.
              La tasa de depósitos no equivale a una tasa de política monetaria.
            </p>
            <p>
              Los datos se consultan en las series documentadas de{" "}
              <a
                className={sourceLinkClass}
                href="https://argentinadatos.com/docs/"
                target="_blank"
                rel="noreferrer"
              >
                ArgentinaDatos
              </a>
              . Las series de inflación, depósitos y UVA identifican al{" "}
              <a
                className={sourceLinkClass}
                href="https://www.bcra.gob.ar/principales-variables/"
                target="_blank"
                rel="noreferrer"
              >
                BCRA
              </a>{" "}
              como fuente; la serie de riesgo país identifica a Ámbito. La
              inflación tiene periodicidad mensual; la UVA, la tasa de depósitos
              y el riesgo país presentan observaciones diarias cuando hay datos
              publicados. La fecha de cada tarjeta corresponde al período
              informado por la serie, no a la hora de publicación.
            </p>
            <p>
              Cada serie se conserva en memoria del servidor por hasta treinta
              minutos y se consulta de manera independiente. Si una falla, las
              demás pueden seguir visibles. Las tarjetas con datos permiten
              copiar el valor, período y fuente al portapapeles. Las fuentes
              pueden corregir observaciones anteriores; Tu Economía no guarda
              versiones históricas de esas revisiones.
            </p>
            <p>
              El panel de actividad utiliza las series del EMAE de{" "}
              <a
                className={sourceLinkClass}
                href={ACTIVITY_DATA_URL}
                target="_blank"
                rel="noreferrer"
              >
                Datos Argentina
              </a>
              , cuya fuente primaria es INDEC. Muestra la variación interanual
              de la serie original y la variación mensual de la serie
              desestacionalizada. La API entrega ambas como fracciones y Tu
              Economía las multiplica por 100 para expresarlas como porcentajes.
              Si falla la API, se consulta el{" "}
              <a
                className={sourceLinkClass}
                href={ACTIVITY_CSV_URL}
                target="_blank"
                rel="noreferrer"
              >
                recurso CSV oficial
              </a>
              . La fecha identifica el mes observado; se conservan doce meses
              para el gráfico interanual. El panel se consulta y almacena en
              memoria por separado durante treinta minutos, de modo que una
              falla no oculta las otras tarjetas. INDEC documenta el método de
              cálculo en su{" "}
              <a
                className={sourceLinkClass}
                href={ACTIVITY_METHOD_URL}
                target="_blank"
                rel="noreferrer"
              >
                metodología del EMAE
              </a>
              .
            </p>
            <p>
              El{" "}
              <a
                className={sourceLinkClass}
                href="https://www.bcra.gob.ar/noticias/el-bcra-anuncia-medidas-para-el-fortalecimiento-de-las-reservas-internacionales-y-la-consolidacion-del-control-de-los-agregados-monetarios/"
                target="_blank"
                rel="noreferrer"
              >
                BCRA
              </a>{" "}
              dejó de anunciar una tasa de política monetaria bajo su esquema
              actual de control de agregados monetarios. Por eso no se presenta
              la tasa de depósitos como si fuera una tasa de política.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="analysis-title">
          <h2
            id="analysis-title"
            className="font-heading text-headline-md text-text-100"
          >
            Análisis histórico
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              El estimador de poder adquisitivo multiplica el monto inicial por
              (1 + inflación mensual / 100) para cada mes posterior al elegido,
              hasta el último mes publicado. Requiere una secuencia mensual
              completa y no rellena observaciones faltantes. El porcentaje
              conservado por una suma mantenida en efectivo es el inverso del
              factor acumulado. Es una estimación basada en el IPC general, no
              en una canasta personal.
            </p>
            <p>
              La comparación entre depósito e inflación utiliza solo meses
              calendario de 30 días. Toma la última TNA de depósitos a 30 días
              publicada antes del inicio del mes si tiene hasta siete días de
              antigüedad. El retorno nominal simulado es TNA × 30 / 365. El
              retorno real estimado es (1 + retorno nominal) / (1 + inflación
              mensual) − 1, usando las tasas como fracciones. El monto final se
              deflacta con el IPC del mismo mes. La tasa anterior al inicio es
              una referencia; no confirma la tasa ofrecida a una persona en la
              fecha de colocación. El cálculo no contempla impuestos, cargos ni
              condiciones bancarias.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="personal-title">
          <h2
            id="personal-title"
            className="font-heading text-headline-md text-text-100"
          >
            Mi economía
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Usted registra manualmente el sueldo neto de cada mes, el importe
              previsto para cada categoría y los gastos realizados. “Sin
              asignar” es sueldo registrado menos importes previstos. “Libre del
              plan” es el importe previsto de una categoría menos gastos
              realizados y pagos futuros pendientes. Ninguna cifra representa un
              saldo bancario confirmado.
            </p>
            <p>
              Los gastos futuros pueden ser únicos o mensuales. Si el
              vencimiento original es el día 29, 30 o 31 y un mes tiene menos
              días, se usa su último día. Al registrar un pago, el importe real
              pasa a gastos realizados y el vencimiento deja de contar como
              pendiente. Los importes previstos no se actualizan con precios
              externos; puede consultar{" "}
              <a
                className={sourceLinkClass}
                href="https://www.preciosclaros.gob.ar/"
                target="_blank"
                rel="noreferrer"
              >
                Precios Claros
              </a>{" "}
              y modificarlos manualmente, verificando el comercio, la fecha y
              las promociones.
            </p>
            <p>
              Puede corregir un gasto registrado o cambiar el importe y
              vencimiento de una cuenta mensual desde un mes determinado. Los
              pagos anteriores se conservan. Las metas de ahorro muestran
              importes reservados que usted ingresa manualmente; no se
              descuentan del presupuesto ni verifican saldos bancarios.
            </p>
            <p>
              El cambio nominal del sueldo compara el mes seleccionado con el
              último mes anterior que usted registró. El cambio de poder
              adquisitivo compara el sueldo actual con el anterior ajustado por
              todos los meses de IPC publicados entre ambos. Si falta un mes de
              IPC, se muestra “s/d”. El IPC general no describe su canasta
              personal.
            </p>
            <p>
              Los registros se guardan en su cuenta. Para modificarlos se
              requiere una suscripción activa. El primer mes es{" "}
              <strong className="font-semibold text-secondary-text-100">
                Gratis
              </strong>
              ; después, ARS 5.000 por mes.{" "}
              <Link to="/terms" className={sourceLinkClass}>
                Ver condiciones
              </Link>
              . Si la suscripción termina, puede seguir consultando, exportando
              o eliminando sus registros desde la sección Usuario.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="prices-title">
          <h2
            id="prices-title"
            className="font-heading text-headline-md text-text-100"
          >
            Precios de productos
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              En la pestaña Precios se muestra el precio más bajo cerca de la
              ubicación elegida y la cadena que lo ofrece. Los productos
              envasados usan precios de lista del día, vía Precios Claros, y no
              incluyen promociones.
            </p>
            <p>
              Los frescos usan un precio típico por kilo del{" "}
              {priceSourceDateLabel}, que varía según el corte y la calidad.
            </p>
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="news-title">
          <h2
            id="news-title"
            className="font-heading text-headline-md text-text-100"
          >
            Noticias económicas
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              Las noticias se obtienen de los feeds RSS de economía de
              iProfesional, Clarín y Página/12. Cada feed se consulta por
              separado y se conserva en memoria del servidor por hasta cinco
              minutos, por lo que la falta de una fuente no oculta las demás.
            </p>
            <p>
              Se muestran el titular, el medio, la fecha de publicación y un
              enlace a la nota original. Los resultados se ordenan desde el más
              reciente y se eliminan duplicados con el mismo enlace.
            </p>
            <p>
              Cuando el feed incluye una bajada o descripción, se convierte a
              texto plano y se limita a 200 caracteres. Es un resumen provisto
              por el feed, no una reproducción ni un sustituto de la nota. La
              disponibilidad, fecha y contenido dependen de cada medio.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
