import { describe, expect, it } from "vitest";

import {
  containsPersonalData,
  exclusionReason,
  isRelevantListing,
  noticeUrl,
  operativeText,
  parseListing,
  parseNoticeBody,
  type ListedNotice,
} from "~/lib/boletin-source.server";

/** The section page's markup, trimmed to two rubros; the structure follows the live page of 2026-11-19. */
const listingHtml = `
<div class="row"><div class="col-md-12">
  <h5 class="seccion-rubro text-white bg-first-section">DECRETOS      </h5>
</div></div>
<div class="row"><div class="col-md-12">
  <a data-toggle="tooltip" href="/detalleAviso/primera/350539/20261119?anexos=1"
     onclick="sendDetalleEvent('Visto', 'Aviso de la Seccion: Primera ID: 350539');" title="Ver anexos" class="btn btn-sm btn-link pull-right">
    <i class="fa fa-paperclip" aria-hidden="true"></i>
  </a>
  <a href="/detalleAviso/primera/350539/20261119" onclick="sendDetalleEvent('Visto', 'Aviso de la Seccion: Primera ID: 350539');">
    <div class="linea-aviso">
      <p class="item">PRESUPUESTO </p>
      <p class="item-detalle"><small>Decreto 1391/2026</small></p>
      <p class="item-detalle" ><small>DNU-2026-1391-APN-PTE - Modificaci&oacute;n.</small></p>
    </div>
  </a>
</div></div>
<div class="row"><div class="col-md-12">
  <h5 class="seccion-rubro text-white bg-first-section">RESOLUCIONES</h5>
</div></div>
<div class="row"><div class="col-md-12">
  <a href="/detalleAviso/primera/350554/20261119" onclick="sendDetalleEvent('Visto', 'x');">
    <div class="linea-aviso">
      <p class="item">MINISTERIO DE ECONOMÍA </p>
      <p class="item-detalle"><small>Resolución 2000/2026</small></p>
    </div>
  </a>
  <a href="/detalleAviso/primera/350554/20261119">duplicate link</a>
</div></div>
<div class="row"><div class="col-md-12">
  <a href="/detalleAviso/primera/350557/20261119">
    <div class="linea-aviso"><p class="item">MINISTERIO DE JUSTICIA</p></div>
  </a>
</div></div>`;

const listed = (overrides: Partial<ListedNotice>): ListedNotice => ({
  id: "1",
  editionDate: "2026-11-19",
  position: 0,
  rubro: "RESOLUCIONES",
  heading: "MINISTERIO DE ECONOMÍA",
  norm: "Resolución 1/2026",
  hasAnnexes: false,
  ...overrides,
});

describe("Boletín Oficial listing", () => {
  it("reads notices in order under their rubro, with annexes and decoded text", () => {
    expect(parseListing(listingHtml)).toEqual([
      {
        id: "350539",
        editionDate: "2026-11-19",
        position: 0,
        rubro: "DECRETOS",
        heading: "PRESUPUESTO",
        norm: "Decreto 1391/2026 · DNU-2026-1391-APN-PTE - Modificación.",
        hasAnnexes: true,
      },
      {
        id: "350554",
        editionDate: "2026-11-19",
        position: 1,
        rubro: "RESOLUCIONES",
        heading: "MINISTERIO DE ECONOMÍA",
        norm: "Resolución 2000/2026",
        hasAnnexes: false,
      },
      {
        id: "350557",
        editionDate: "2026-11-19",
        position: 2,
        rubro: "RESOLUCIONES",
        heading: "MINISTERIO DE JUSTICIA",
        norm: "",
        hasAnnexes: false,
      },
    ]);
  });

  it("drops entries without a heading", () => {
    expect(
      parseListing(
        '<a href="/detalleAviso/primera/9/20261119"><p class="item-detalle">x</p></a>',
      ),
    ).toEqual([]);
  });

  it("builds the notice link from the edition date", () => {
    expect(noticeUrl("350539", "2026-11-19")).toBe(
      "https://www.boletinoficial.gob.ar/detalleAviso/primera/350539/20261119",
    );
  });

  it("keeps every decree and the followed agencies of the other rubros", () => {
    expect(
      isRelevantListing(listed({ rubro: "DECRETOS", heading: "PRESUPUESTO" })),
    ).toBe(true);

    expect(
      isRelevantListing(
        listed({ heading: "MINISTERIO DE ECONOMÍA - SECRETARÍA DE ENERGÍA" }),
      ),
    ).toBe(true);

    expect(
      isRelevantListing(
        listed({
          rubro: "AVISOS OFICIALES",
          heading: "BANCO CENTRAL DE LA REPÚBLICA ARGENTINA",
        }),
      ),
    ).toBe(true);

    expect(isRelevantListing(listed({ heading: "MINISTERIO DE SALUD" }))).toBe(
      false,
    );
  });

  it("leaves out customs edicts, collective agreements and repeated notices", () => {
    expect(
      isRelevantListing(
        listed({
          rubro: "AVISOS OFICIALES",
          heading:
            "AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO - ADUANA CONCORDIA",
        }),
      ),
    ).toBe(false);

    expect(
      isRelevantListing(
        listed({
          rubro: "AVISOS OFICIALES",
          heading:
            "AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO - DIRECCIÓN REGIONAL SALTA",
        }),
      ),
    ).toBe(false);

    expect(
      isRelevantListing(
        listed({
          rubro: "RESOLUCIONES GENERALES",
          heading: "AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO",
        }),
      ),
    ).toBe(true);

    expect(
      isRelevantListing(
        listed({
          rubro: "CONVENCIONES COLECTIVAS DE TRABAJO",
          heading: "MINISTERIO DE CAPITAL HUMANO",
        }),
      ),
    ).toBe(false);

    expect(
      isRelevantListing(
        listed({
          rubro: "AVISOS OFICIALES - ANTERIOR",
          heading: "BANCO CENTRAL DE LA REPÚBLICA ARGENTINA",
        }),
      ),
    ).toBe(false);
  });
});

const noticePage = (paragraphs: string[]) => `
<div class="row" id="detalleAviso">
  <div id="tituloDetalleAviso" class="col-md-12 form-group"><h1>MINISTERIO DE ECONOMÍA</h1></div>
  <div id="cuerpoDetalleAviso" class="col-md-12 form-group detalle-cuerpo justified">
    <p><style>table tr td {border: 1px solid grey;}</style>${paragraphs.map((text) => `<p>${text}</p>`).join("")}</p>
    <div class="inner"><table><tr><td>Tabla</td><td>1</td></tr></table></div>
  </div>
</div>
<div class="row"><p class="text-muted"><small>Fecha de publicación 19/11/2026</small></p></div>`;

describe("Boletín Oficial notice body", () => {
  it("reads the body element only, one line per paragraph, without the style block", () => {
    expect(
      parseNoticeBody(
        noticePage(["VISTO el expediente&nbsp;N°&nbsp;1", "RESUELVE:"]),
      ),
    ).toBe("VISTO el expediente N° 1\nRESUELVE:\nTabla 1");
  });

  it("returns null when the page has no body", () => {
    expect(parseNoticeBody("<html><body>Error</body></html>")).toBeNull();
  });

  const body = [
    "VISTO el Expediente EX-2026-1 y CONSIDERANDO:",
    "Que corresponde actualizar el régimen.",
    "EL MINISTRO DE ECONOMÍA RESUELVE:",
    "ARTÍCULO 1°.- Apruébase el reglamento que como anexo forma parte de la presente.",
    "ARTÍCULO 2°.- La presente entrará en vigencia el día siguiente al de su publicación.",
    "ARTÍCULO 3°.- Comuníquese, publíquese, dese a la Dirección Nacional del Registro Oficial y archívese.",
    "Nombre Apellido",
    "e. 19/11/2026 N° 86788/26 v. 19/11/2026",
  ].join("\n");

  it("keeps the articles after the operative marker, without the closing article, signatures and stamp", () => {
    const expected = [
      "RESUELVE:",
      "ARTÍCULO 1°.- Apruébase el reglamento que como anexo forma parte de la presente.",
      "ARTÍCULO 2°.- La presente entrará en vigencia el día siguiente al de su publicación.",
    ].join("\n");

    expect(operativeText(body)).toEqual({
      text: expected,
      truncated: false,
      fullLength: expected.length,
    });
  });

  it("removes signature lines of summarized notices", () => {
    expect(
      operativeText(
        "SINTESIS: Resolución 1\nRESUELVE: Aprobar el régimen.\nFdo. Nombre APELLIDO – Superintendente.",
      ).text,
    ).toBe("RESUELVE: Aprobar el régimen.");
  });

  it("cuts a long text before the article that would cross the limit", () => {
    const long = [
      "RESUELVE:",
      `ARTÍCULO 1°.- ${"a".repeat(60)}`,
      `ARTÍCULO 2°.- ${"b".repeat(60)}`,
      `ARTÍCULO 3°.- ${"c".repeat(60)}`,
    ].join("\n");

    const result = operativeText(long, 160);

    expect(result.truncated).toBe(true);
    expect(result.fullLength).toBe(long.length);
    expect(result.text.endsWith("b".repeat(60))).toBe(true);
    expect(result.text).not.toContain("ARTÍCULO 3");
  });

  it("cuts a text without articles at a line break", () => {
    const result = operativeText(`${"a".repeat(80)}\n${"b".repeat(80)}`, 100);

    expect(result).toMatchObject({ text: "a".repeat(80), truncated: true });
  });
});

describe("Boletín Oficial exclusions", () => {
  it("detects a DNI or a natural person's CUIT, not amounts or companies' CUITs", () => {
    expect(
      containsPersonalData("Desígnase a la señora X (D.N.I. N° 30.111.222)"),
    ).toBe(true);
    expect(containsPersonalData("DNI 12345678")).toBe(true);
    expect(containsPersonalData("CUIT N° 20-12345678-3")).toBe(true);
    expect(containsPersonalData("con CUIL 27123456784")).toBe(true);

    expect(containsPersonalData("la firma (30-71234567-8) presentó")).toBe(
      false,
    );

    expect(containsPersonalData("por $78.700.000.000.000")).toBe(false);

    expect(containsPersonalData("presentar el DNI ante la oficina")).toBe(
      false,
    );
  });

  it("excludes personal data, edicts and acts about a person", () => {
    expect(
      exclusionReason(
        "RESUELVE:\nARTÍCULO 1°.- Dase de baja a X, DNI 30.111.222.",
      ),
    ).toBe("personal-data");

    expect(exclusionReason("EDICTO\nSe cita a las personas detalladas…")).toBe(
      "edict",
    );

    expect(
      exclusionReason(
        "DECRETA:\nARTÍCULO 1°.- Desígnase con carácter transitorio en el cargo de Director.",
      ),
    ).toBe("individual-act");

    expect(
      exclusionReason(
        "RESUELVE: Aplicar al Contador Público un LLAMADO DE ATENCIÓN en los términos del artículo 59.",
      ),
    ).toBe("individual-act");
  });

  it("keeps ordinary norms that mention resources or officials in charge", () => {
    expect(
      exclusionReason(
        "RESUELVE:\nARTÍCULO 1°.- Asígnanse recursos a cargo de la Secretaría de Energía para el régimen de subsidios.\nARTÍCULO 2°.- Desígnase autoridad de aplicación a la Secretaría.",
      ),
    ).toBeNull();
  });
});
