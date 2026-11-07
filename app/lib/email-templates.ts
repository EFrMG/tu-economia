/**
 * Spanish wording for the two transactional messages the Worker sends: sign-in access links, and the notice that precedes the deletion of a lapsed account's records. Emails cannot reference the app's Tailwind tokens, so the few inline colours restate hsl values from app/css/tailwind-theme.css by hand. Both builders interpolate only this Worker's own validated origin URL and Intl dates, so no further escaping is applied.
 */

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const page = (body: string) =>
  `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin: 0; padding: 24px 12px; background-color: hsl(240, 4.8%, 95.9%);">
    <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: hsl(0, 0%, 100%); border: 1px solid hsl(240, 5.9%, 90%); color: hsl(240, 5.9%, 10%); font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.6;">
      <p style="margin: 0 0 24px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: hsl(240, 3.8%, 46%);">Tu Economía</p>
      ${body}
    </div>
  </body>
</html>`;

const paragraph = (content: string) =>
  `<p style="margin: 0 0 12px;">${content}</p>`;

/** A dark-teal call to action restating --color-primary-800 from app/css/tailwind-theme.css. */
const action = (label: string, href: string) =>
  `<p style="margin: 20px 0;"><a href="${href}" style="border-radius: 0; display: inline-block; background-color: hsl(191.5, 100%, 19.4%); color: hsl(180, 7%, 97%); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; padding: 12px 20px; text-decoration: none;">${label}</a></p>`;

/** The access link Better Auth generates on every magic-link sign-in. */
export const accessLinkEmail = ({ url }: { url: string }): EmailContent => ({
  subject: "Tu enlace de acceso a Tu Economía",
  text: `Acceda a Tu Economía con el siguiente enlace:\n\n${url}\n\nEl enlace vence a los 5 minutos y solo puede usarse una vez.\n\nSi no lo solicitó, puede ignorar este mensaje: no se realizó ningún cambio en su cuenta.`,
  html: page(
    paragraph("Acceda a su cuenta de Tu Economía con el siguiente enlace:") +
      action("Acceder", url) +
      paragraph(
        "El enlace vence a los 5 minutos y solo puede usarse una vez.",
      ) +
      paragraph(
        "Si no lo solicitó, puede ignorar este mensaje: no se realizó ningún cambio en su cuenta.",
      ),
  ),
});

const deletionFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** The deletion deadline as the same Argentine calendar date the app shows, e.g. "31 de julio de 2026". */
const deletionDate = (timestamp: string) =>
  deletionFormatter.format(new Date(timestamp));

/**
 * The notice the daily retention job sends thirty days before a lapsed account's records are removed. It states the date the records disappear and links to the Usuario tab, where export and reactivation live.
 */
export const retentionNoticeEmail = ({
  deleteOn,
  url,
}: {
  deleteOn: string;
  url: string;
}): EmailContent => {
  const date = deletionDate(deleteOn);

  return {
    subject: `Se eliminarán sus registros de Mi economía el ${date}`,
    text: `El período de acceso de su cuenta terminó. Sus registros de Mi economía se eliminarán de forma permanente el ${date}.\n\nAntes de esa fecha puede descargar una copia de sus registros y, si así lo desea, reactivar la suscripción desde la pestaña Usuario de Mi economía:\n\n${url}\n\nSi reactiva la suscripción, sus registros se conservarán.`,
    html: page(
      paragraph(
        `El período de acceso de su cuenta terminó. Sus registros de Mi economía se eliminarán de forma permanente el <strong>${date}</strong>.`,
      ) +
        paragraph(
          "Antes de esa fecha puede descargar una copia de sus registros y, si así lo desea, reactivar la suscripción desde la pestaña Usuario de Mi economía:",
        ) +
        action("Abrir Mi economía", url) +
        paragraph("Si reactiva la suscripción, sus registros se conservarán."),
    ),
  };
};
