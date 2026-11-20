import { z } from "zod";

import { containsPersonalData } from "~/lib/boletin-source.server";

export const BOLETIN_MODEL = "@cf/openai/gpt-oss-120b";

const SYSTEM_PROMPT = `Sos un asistente que resume normas del Boletín Oficial de la República Argentina para un público general.

Reglas:
- Escribí en español rioplatense formal, claro y sereno, sin dramatizar ni opinar.
- Explicá qué cambia y a quién afecta. No repitas los considerandos.
- Usá solo cifras, fechas y porcentajes que aparezcan textualmente en la norma. No calcules ni redondees.
- Escribí las fechas con el mes en palabras, por ejemplo "29 de enero de 2027".
- Explicá las siglas la primera vez que aparezcan.
- No incluyas nombres de personas, números de DNI, CUIT ni otros datos personales.
- Si el texto se indica como incompleto, resumí solo lo que figura en él y no supongas el resto.
- Si se indica que la norma tiene anexos y el detalle (tablas, montos, cuadros tarifarios) está en ellos, decí que el detalle figura en los anexos; no lo inventes.
- Si la norma no afecta a los hogares (es interna de la administración, una designación o un trámite individual), indicalo con "afecta_hogares": false.
- Respondé solo con un objeto JSON con esta forma:
{"titulo": "un título breve, como máximo 12 palabras", "resumen": "una o dos oraciones, como máximo 60 palabras", "puntos": ["hasta 3 puntos breves"], "afecta_hogares": true}`;

const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    resumen: { type: "string" },
    puntos: { type: "array", items: { type: "string" }, maxItems: 3 },
    afecta_hogares: { type: "boolean" },
  },
  required: ["titulo", "resumen", "puntos", "afecta_hogares"],
  additionalProperties: false,
};

/** Generous bounds over the prompt's limits: a slightly long summary is fine, a runaway one is not. */
/** gpt-oss writes typographic hyphens and narrow spaces ("29‑01‑2027", "1 de mayo") that the app's fonts lack or space unevenly; store plain ones. */
export const plainTypography = (text: string) =>
  text
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/[\u2007\u2009\u200A\u202F]/g, " ");

const summaryText = (max: number) =>
  z.string().transform(plainTypography).pipe(z.string().trim().min(1).max(max));

const summarySchema = z.object({
  titulo: summaryText(160),
  resumen: summaryText(700),
  puntos: z.array(summaryText(300)).max(3),
  afecta_hogares: z.boolean(),
});

export type NoticeSummary = z.infer<typeof summarySchema>;

/** The Chat Completions shape Workers AI returns for gpt-oss, plus the `response` field other models use. `usage.neurons` is what the call cost. */
const outputSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullish() }).nullish(),
      }),
    )
    .nullish(),
  response: z.union([z.string(), z.record(z.string(), z.unknown())]).nullish(),
  usage: z.object({ neurons: z.number().nullish() }).nullish(),
});

export interface SummaryInput {
  /** "Norma: <rubro> · <heading> · <norm>" */
  header: string;
  text: string;
  truncated: boolean;
  fullLength: number;
  hasAnnexes: boolean;
}

export function summaryMessages(input: SummaryInput) {
  const notes: string[] = [];

  if (input.truncated)
    notes.push(
      `Texto incompleto: se incluyen los primeros ${input.text.length} de ${input.fullLength} caracteres de la parte dispositiva, cortados al inicio de un artículo.`,
    );

  if (input.hasAnnexes) notes.push("La norma tiene anexos que no se incluyen.");

  const user = [
    input.header,
    ...notes.map((note) => `Nota: ${note}`),
    "",
    "Texto dispositivo:",
    input.text,
  ].join("\n");

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: user },
  ];
}

/** The first JSON object in the model's text; the model is asked for JSON only but may wrap it. */
function jsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The validated summary and its cost, or null summary when the output has no usable JSON. */
export function parseSummaryOutput(output: unknown): {
  summary: NoticeSummary | null;
  neurons: number | null;
} {
  const parsed = outputSchema.safeParse(output);
  if (!parsed.success) return { summary: null, neurons: null };

  const { choices, response, usage } = parsed.data;
  const neurons = usage?.neurons ?? null;
  const content = choices?.[0]?.message?.content ?? response;

  const candidate =
    typeof content === "string" ? jsonObject(content) : (content ?? null);

  const summary = summarySchema.safeParse(candidate);

  return { summary: summary.success ? summary.data : null, neurons };
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const SCALE = /^\s+(mil\s+millones|millones|millón)\b/i;

/** "1.234.567,5" → "1234567.5": dots before three digits are thousands separators, the comma is the decimal mark. */
const normalizeNumber = (token: string) =>
  token
    .replace(/\.(?=\d{3}(?!\d))/g, "")
    .replace(",", ".")
    .replace(/\.$/, "");

const scaleFactor = (word: string) =>
  word.toLowerCase().split(/\s+/)[0] === "mil" ? 1e9 : 1e6;

interface FoundNumber {
  value: string;
  /** "4.800 millones" also reads as 4800000000. */
  expanded: string | null;
}

function findNumbers(text: string): FoundNumber[] {
  return [...text.matchAll(NUMBER)].map((match) => {
    const value = normalizeNumber(match[0]);
    const scale = SCALE.exec(text.slice(match.index + match[0].length));
    const expanded = scale ? Number(value) * scaleFactor(scale[1]) : NaN;

    return {
      value,
      expanded: Number.isFinite(expanded) ? String(Math.round(expanded)) : null,
    };
  });
}

/** Figures in the summary that do not appear in the source. A rescaled amount ("USD 4.800 millones") counts as present when its full value is in the source. */
export function figuresNotInSource(summaryText: string, source: string) {
  const known = new Set(
    findNumbers(source).flatMap(({ value, expanded }) =>
      expanded ? [value, expanded] : [value],
    ),
  );

  return [
    ...new Set(
      findNumbers(summaryText)
        .filter(
          ({ value, expanded }) =>
            !known.has(value) && !(expanded && known.has(expanded)),
        )
        .map(({ value }) => value),
    ),
  ];
}

export type SummaryRejection = "invented-figures" | "personal-data";

/** Rejects a summary with a figure absent from the source (the header with the norm's number counts as source) or with personal data. */
export function summaryRejection(
  summary: NoticeSummary,
  source: string,
): SummaryRejection | null {
  const text = [summary.titulo, summary.resumen, ...summary.puntos].join("\n");

  if (containsPersonalData(text)) return "personal-data";
  if (figuresNotInSource(text, source).length > 0) return "invented-figures";

  return null;
}

/** One Workers AI call. Throws when the call fails (quota, network, model error); the caller retries on a later run. */
export async function requestSummary(ai: Ai, input: SummaryInput) {
  const output: unknown = await ai.run(BOLETIN_MODEL, {
    messages: summaryMessages(input),
    max_tokens: 1500,
    temperature: 0.2,
    reasoning_effort: "low",
    response_format: {
      type: "json_schema",
      json_schema: { name: "resumen_norma", schema: SUMMARY_JSON_SCHEMA },
    },
  });

  return parseSummaryOutput(output);
}
