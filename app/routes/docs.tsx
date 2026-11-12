import { Link } from "react-router";

import type { Route } from "./+types/docs";
import { accionesLabel, isEquitiesBymaEnabled } from "~/lib/acciones-panels";
import { pageMeta } from "~/lib/meta";
import {
  ACTIVITY_CSV_URL,
  ACTIVITY_DATA_URL,
  ACTIVITY_METHOD_URL,
} from "~/lib/economic-activity";
import { PRICE_SOURCE_DATE } from "~/lib/prices";
import { workerEnvContext } from "~/lib/worker-context";

export function meta() {
  return pageMeta({
    title: "Documentación",
    description:
      "Fuentes, cálculos, actualización y límites de los datos presentados en Tu Economía.",
    path: "/docs",
  });
}

/** The Acciones section describes the BYMA panels only while they are shown. */
export function loader({ context }: Route.LoaderArgs) {
  return {
    equitiesBymaEnabled: isEquitiesBymaEnabled(context.get(workerEnvContext)),
  };
}

const sourceLinkClass =
  "font-mono text-data-label text-primary-text-100 hocus:underline underline-offset-4 focus-visible:outline-none";

const sectionClass = "border-base-700 border-t pt-8";

const priceSourceDateLabel = PRICE_SOURCE_DATE.split("-").reverse().join("/");

export default function Docs({ loaderData }: Route.ComponentProps) {
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
              La sección Indicadores agrupa las series por tema: precios
              (inflación mensual, interanual y esperada a 12 meses), tasas de
              interés (depósitos a 30 días, BADLAR, TAMAR y préstamos
              personales), dólar y sector externo (reservas internacionales,
              dólar minorista, dólar mayorista de referencia y riesgo país),
              dinero (base monetaria y variación interanual del M2 privado) y
              unidades de actualización (UVA, UVI, CER e ICL). También presenta
              el estimador mensual de actividad económica (EMAE). Cada tarjeta
              indica su unidad y presenta el valor tal como lo informa la serie,
              sin conversiones de escala o frecuencia. Las tasas se expresan
              como nominales anuales. Ninguna de ellas equivale a una tasa de
              política monetaria.
            </p>
            <p>
              Todas las series, salvo el riesgo país, se consultan directamente
              en la API de Estadísticas Monetarias del{" "}
              <a
                className={sourceLinkClass}
                href="https://www.bcra.gob.ar/apis-banco-central/"
                target="_blank"
                rel="noreferrer"
              >
                BCRA
              </a>
              . El BCRA no publica el riesgo país; esa serie identifica a Ámbito
              como fuente y se consulta en{" "}
              <a
                className={sourceLinkClass}
                href="https://argentinadatos.com/docs/"
                target="_blank"
                rel="noreferrer"
              >
                ArgentinaDatos
              </a>
              . Las series se publican con distintas frecuencias y demoras: las
              reservas y las tasas suelen informarse con algunos días hábiles de
              atraso. La fecha de cada tarjeta corresponde al período informado
              por la serie, no a la hora de publicación.
            </p>
            <p>
              Los valores se conservan en memoria del servidor por hasta treinta
              minutos. Las series del BCRA y el riesgo país se consultan por
              separado, y una serie con datos inválidos no impide mostrar las
              demás. Las tarjetas con datos permiten copiar el valor, período y
              fuente al portapapeles. Las fuentes pueden corregir observaciones
              anteriores; Tu Economía no guarda versiones históricas de esas
              revisiones.
            </p>
            <p>
              Tres tablas se consultan directamente en la API del{" "}
              <a
                className={sourceLinkClass}
                href="https://api.indec.gob.ar/"
                target="_blank"
                rel="noreferrer"
              >
                INDEC
              </a>
              . La canasta básica muestra el valor mensual de la canasta
              alimentaria (línea de indigencia) y de la total (línea de pobreza)
              en Gran Buenos Aires, por adulto equivalente y para el hogar tipo
              2 del INDEC, de cuatro personas. La tabla de salarios muestra la
              variación mensual e interanual del índice de salarios por sector y
              la variación interanual real, que descuenta la inflación
              interanual del mismo mes. La tabla de inflación muestra el IPC por
              división, por categoría (núcleo, regulados, estacionales, bienes y
              servicios) y por región. Cada tabla indica el mes al que
              corresponde y se conserva en memoria del servidor por hasta una
              hora.
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

        <section className={sectionClass} aria-labelledby="equities-title">
          <h2
            id="equities-title"
            className="font-heading text-headline-md text-text-100"
          >
            {accionesLabel(loaderData.equitiesBymaEnabled)}
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              La sección {accionesLabel(loaderData.equitiesBymaEnabled)} reúne
              información pública de las empresas argentinas que cotizan en los
              Estados Unidos, obtenida de{" "}
              <a
                className={sourceLinkClass}
                href="https://www.sec.gov/edgar/search/"
                target="_blank"
                rel="noreferrer"
              >
                EDGAR
              </a>
              , el sistema de presentaciones de la SEC, el regulador bursátil de
              ese país. Para cada empresa se indica su último informe anual
              (formulario 20-F, 10-K o 40-F), el período que cubre y la fecha en
              que se presentó, con un enlace al documento en sec.gov.
            </p>
            <p>
              Al elegir una empresa se muestran sus informes más recientes y
              cuatro cifras de su último informe anual: ingresos, resultado del
              ejercicio, activo total y patrimonio neto. Cada cifra se presenta
              tal como la informó la empresa, en su moneda y bajo su norma
              contable; todas provienen del mismo informe, cuyo cierre,
              formulario y fecha de presentación se indican una vez. No se
              convierten monedas ni se calculan variaciones: las emisoras
              argentinas reexpresan sus estados contables por inflación, por lo
              que las cifras de distintos ejercicios no son directamente
              comparables. Bajo NIIF, el resultado del ejercicio incluye la
              participación no controladora. Si una empresa no informa un
              concepto con la etiqueta utilizada en ese informe, se indica s/d;
              por ejemplo, los bancos no suelen informar ingresos con esa
              etiqueta.
            </p>
            <p>
              La lista de informes incluye los anuales, los trimestrales y los
              de emisor extranjero (formulario 6-K, con el que las emisoras
              extranjeras presentan la mayor parte de su información periódica),
              con sus modificaciones; no incluye las declaraciones de tenencias
              de directivos ni otros formularios administrativos. La descripción
              es la que indicó la empresa, en inglés, cuando agrega información
              al nombre del formulario.
            </p>
            <p>
              La identidad de cada empresa se obtiene del registro de tickers de
              la SEC y se confirma con sus propias presentaciones; si no
              coincide, la empresa figura como no disponible. Los informes se
              conservan en memoria del servidor por hasta seis horas. La
              información publicada en sec.gov es pública y puede copiarse y
              redistribuirse. Se presenta como referencia y no constituye una
              recomendación de inversión.
            </p>
            <p>
              La calculadora de CEDEAR estima el precio teórico de un CEDEAR en
              pesos como precio del subyacente en dólares × tipo de cambio ÷
              ratio de conversión. El ratio indica cuántos CEDEAR equivalen a
              una acción: con un ratio de 20:1, cada CEDEAR representa la
              vigésima parte de una acción. Usted ingresa el precio del
              subyacente y el ratio; la página no muestra cotizaciones de ningún
              título. El tipo de cambio se completa con el precio de venta del
              CCL o del MEP de Dólar API, el mismo que figura en el panel de
              cotizaciones, y puede reemplazarse por otro valor; la página
              indica en todo momento cuál se está usando. Si la cotización no
              está disponible, el campo queda para que usted lo complete.
            </p>
            <p>
              Si además ingresa el precio de mercado del CEDEAR, se calculan el
              tipo de cambio implícito (precio de mercado × ratio ÷ precio del
              subyacente), su diferencia porcentual con el tipo de cambio de
              referencia y la prima o el descuento frente al precio teórico. En
              porcentaje, la prima y esa diferencia coinciden por construcción.
              El resultado no contempla comisiones, impuestos, la diferencia
              entre precios de compra y de venta, los horarios de cada mercado
              ni los dividendos. El ratio de cada programa lo fija su emisor y
              puede cambiar, por lo que conviene confirmarlo con el emisor o con
              su agente de bolsa. Los valores ingresados se guardan en la
              dirección de la página, de modo que un cálculo puede compartirse
              con su enlace.
            </p>
            <p>
              Ejemplo ilustrativo, con valores ficticios: si el subyacente vale
              US$ 100, el ratio es 20:1 y el tipo de cambio es ARS 1.000, el
              precio teórico es 100 × 1.000 ÷ 20 = ARS 5.000. Si el CEDEAR se
              negocia a ARS 5.250, el tipo de cambio implícito es 5.250 × 20 ÷
              100 = ARS 1.050, un 5% por encima del de referencia, y la prima es
              de ARS 250 (5%).
            </p>
            {loaderData.equitiesBymaEnabled ? (
              <>
                <p>
                  La sección también muestra los CEDEAR (incluidos los ETF) y
                  las acciones del panel líder del S&P Merval, ordenados por
                  monto operado en pesos, junto con el S&P Merval, el S&P BYMA
                  General y el estado de la rueda. La tabla de CEDEAR presenta
                  los 30 más operados; si operaron menos, se completa en orden
                  alfabético con especies sin operaciones. Los precios
                  corresponden al plazo de 24 horas.
                </p>
                <p>
                  Los datos se consultan en{" "}
                  <a
                    className={sourceLinkClass}
                    href="https://open.bymadata.com.ar/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    BYMA Open Data
                  </a>
                  , el servicio público y gratuito del sitio de BYMA, con una
                  demora aproximada de 20 minutos. Los valores se presentan como
                  referencia y no constituyen una recomendación de inversión.
                </p>
                <p>
                  Un CEDEAR puede negociarse en pesos, en dólares MEP y en
                  dólares cable. El tipo de cambio implícito es el último precio
                  en pesos dividido por el último precio en dólares; el ratio de
                  conversión se cancela. Se utiliza la especie en dólares cable
                  (CCL) cuando operó en el día y, si no, la especie en dólares
                  MEP. La variación en pesos se descompone según (1 + variación
                  en pesos) = (1 + variación en dólares) × (1 + variación del
                  tipo de cambio implícito), cada una contra su cierre anterior;
                  como las partes se combinan multiplicando, su suma puede
                  diferir levemente de la variación en pesos. Si ninguna especie
                  en dólares operó o falta un cierre anterior, se informa como
                  dato no disponible.
                </p>
                <p>
                  La variación de la especie en dólares es una aproximación al
                  movimiento del activo subyacente, no su precio en el mercado
                  de origen. Muchas especies en dólares tienen poco volumen, por
                  lo que esa aproximación puede no reflejar el día completo.
                </p>
                <p>
                  Cada lista se conserva en memoria del servidor por hasta dos
                  minutos y se consulta por separado, de modo que una falla no
                  oculta los demás paneles. Si no se puede renovar una lista, se
                  puede mostrar el último resultado obtenido por este proceso
                  durante un máximo de quince minutos, identificado como no
                  actualizado. El estado de la rueda no se reemplaza por un
                  resultado anterior.
                </p>
              </>
            ) : null}
          </div>
        </section>

        <section className={sectionClass} aria-labelledby="rates-title">
          <h2
            id="rates-title"
            className="font-heading text-headline-md text-text-100"
          >
            Tasas
          </h2>
          <div className="mt-4 stack-4 text-body-sm text-text-300">
            <p>
              La sección Tasas compara préstamos personales en pesos y tarjetas
              de crédito por entidad, con los datos que cada entidad informa al{" "}
              <a
                className={sourceLinkClass}
                href="https://www.bcra.gob.ar/apis-banco-central/"
                target="_blank"
                rel="noreferrer"
              >
                BCRA
              </a>{" "}
              en el Régimen de Transparencia. Para los préstamos se muestran el
              costo financiero total (CFT) y la tasa efectiva anual (TEA)
              máximos, el plazo máximo y los montos; para las tarjetas, las
              tasas efectivas anuales máximas de financiación y de adelanto en
              efectivo y las comisiones de mantenimiento y renovación, sin
              bonificaciones.
            </p>
            <p>
              Son valores máximos: la tasa que ofrece una entidad puede ser
              menor según el perfil de quien la solicita. Por eso la tabla
              compara solo los productos que cumplen los filtros elegidos
              (perfil, plazo, monto, segmento y provincia) y muestra, por
              entidad, el de menor costo. Cada fila indica la fecha en que la
              entidad lo informó.
            </p>
            <p>
              Los datos se consultan una vez por semana. Se muestran los
              préstamos en pesos y los productos informados en los últimos doce
              meses. Un CFT máximo menor al 10% se señala como valor
              inusualmente bajo, para confirmarlo con la entidad.
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
