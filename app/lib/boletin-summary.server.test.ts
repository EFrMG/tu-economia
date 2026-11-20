import { describe, expect, it, vi } from "vitest";

import {
  BOLETIN_MODEL,
  figuresNotInSource,
  parseSummaryOutput,
  requestSummary,
  summaryMessages,
  summaryRejection,
  type NoticeSummary,
} from "~/lib/boletin-summary.server";

const summary: NoticeSummary = {
  titulo: "Nueva Letra del Tesoro vinculada al dólar",
  resumen:
    "Se emite una Letra del Tesoro por hasta USD 4.800 millones con vencimiento el 29 de enero de 2027.",
  puntos: ["Se emite el 20 de noviembre de 2026."],
  afecta_hogares: false,
};

/** The Chat Completions shape Workers AI returned for gpt-oss-120b on 2026-11-19, trimmed. */
const chatOutput = (content: string) => ({
  id: "chatcmpl-1",
  object: "chat.completion",
  model: BOLETIN_MODEL,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content, reasoning_content: "…" },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 591,
    completion_tokens: 149,
    total_tokens: 740,
    neurons: 28.96,
  },
});

describe("Boletín summary output", () => {
  it("reads the JSON summary and the call's Neurons from a chat completion", () => {
    expect(parseSummaryOutput(chatOutput(JSON.stringify(summary)))).toEqual({
      summary,
      neurons: 28.96,
    });
  });

  it("accepts JSON wrapped in text and the `response` field of other models", () => {
    expect(
      parseSummaryOutput(chatOutput(`Aquí está:\n${JSON.stringify(summary)}\n`))
        .summary,
    ).toEqual(summary);

    expect(parseSummaryOutput({ response: summary }).summary).toEqual(summary);
  });

  it("stores plain hyphens and spaces instead of the typographic ones gpt-oss writes", () => {
    const typographic = {
      ...summary,
      resumen: "Vence el 29‑01‑2027, a partir del 1 de mayo.",
      puntos: ["Central III"],
    };

    expect(
      parseSummaryOutput(chatOutput(JSON.stringify(typographic))).summary,
    ).toMatchObject({
      resumen: "Vence el 29-01-2027, a partir del 1 de mayo.",
      puntos: ["Central III"],
    });
  });

  it("returns no summary for truncated, malformed or oversized output", () => {
    expect(parseSummaryOutput(chatOutput('{"titulo": "Se dispone'))).toEqual({
      summary: null,
      neurons: 28.96,
    });

    expect(
      parseSummaryOutput(
        chatOutput(
          JSON.stringify({ ...summary, puntos: ["a", "b", "c", "d"] }),
        ),
      ).summary,
    ).toBeNull();

    expect(
      parseSummaryOutput(
        chatOutput(JSON.stringify({ ...summary, resumen: "x".repeat(800) })),
      ).summary,
    ).toBeNull();

    expect(parseSummaryOutput("not an object")).toEqual({
      summary: null,
      neurons: null,
    });
  });
});

describe("Boletín summary checks", () => {
  const source =
    "Norma: RESOLUCIONES CONJUNTAS · Resolución Conjunta 66/2026\nDispónese la emisión por hasta USD 4.800.000.000, con vencimiento el 29 de enero de 2027. Fecha de emisión: 20 de noviembre de 2026.";

  it("accepts figures from the source, the header and rescaled amounts", () => {
    expect(summaryRejection(summary, source)).toBeNull();

    expect(
      figuresNotInSource("La Resolución Conjunta 66/2026 dispone…", source),
    ).toEqual([]);
    expect(figuresNotInSource("por USD 4.800.000.000", source)).toEqual([]);
  });

  it("rejects figures that are not in the source, including wrong rescaled amounts", () => {
    expect(figuresNotInSource("por hasta USD 4.900 millones", source)).toEqual([
      "4900",
    ]);

    expect(figuresNotInSource("una tasa del 35,5 %", source)).toEqual(["35.5"]);

    expect(
      summaryRejection(
        { ...summary, puntos: ["Vence el 30 de enero de 2027."] },
        source,
      ),
    ).toBe("invented-figures");
  });

  it("rejects personal data even when it is in the source", () => {
    expect(
      summaryRejection(
        { ...summary, resumen: "Se designa a la persona con DNI 30.111.222." },
        `${source} DNI 30.111.222`,
      ),
    ).toBe("personal-data");
  });
});

describe("Boletín summary request", () => {
  it("states partial text and annexes in the prompt", () => {
    const [system, user] = summaryMessages({
      header: "Norma: DECRETOS · PRESUPUESTO · Decreto 1391/2026",
      text: "DECRETA:\nARTÍCULO 1°.- …",
      truncated: true,
      fullLength: 20_000,
      hasAnnexes: true,
    });

    expect(system.role).toBe("system");

    expect(user.content).toContain(
      "Nota: Texto incompleto: se incluyen los primeros 24 de 20000",
    );

    expect(user.content).toContain(
      "Nota: La norma tiene anexos que no se incluyen.",
    );

    expect(
      user.content.endsWith("Texto dispositivo:\nDECRETA:\nARTÍCULO 1°.- …"),
    ).toBe(true);
  });

  it("calls gpt-oss-120b with low reasoning effort and a JSON schema", async () => {
    const run = vi.fn(async () => chatOutput(JSON.stringify(summary)));

    const result = await requestSummary({ run } as unknown as Ai, {
      header: "Norma: x",
      text: "RESUELVE: …",
      truncated: false,
      fullLength: 11,
      hasAnnexes: false,
    });

    expect(result.summary).toEqual(summary);

    expect(run).toHaveBeenCalledWith(
      BOLETIN_MODEL,
      expect.objectContaining({
        reasoning_effort: "low",
        response_format: expect.objectContaining({ type: "json_schema" }),
      }),
    );
  });
});
