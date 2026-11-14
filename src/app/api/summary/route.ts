/**
 * POST /api/summary
 * Body: SummaryFacts (src/lib/summary.ts). Returns { text, source }.
 *
 * Asks DeepSeek to explain the comparison in plain words. If no API key is
 * set, or the call fails, it returns the fixed template text, so the page
 * always has a summary.
 *
 * Needs DEEPSEEK_API_KEY in the server's environment (locally it is read from
 * your shell; on Vercel add it under Project Settings → Environment Variables).
 */
import { templateSummary, type SummaryFacts, type SummaryResponse } from "@/lib/summary";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-flash";

const SYSTEM = `You explain crop rotation advice to smallholder farmers in Zambia, many of them new to farming.

You receive facts as JSON: a place, its rainfall history from satellite records, the farmer's soil if they gave it, and up to three crop rotations with scores, reasons, risks and a rough value. The first option is either what the farmer grows now or, for someone just starting out, what most farmers there do. Prices may be the farmer's own figures.

Write one short paragraph of 90 to 130 words, in simple English a beginner understands:
- Say what the weather is usually like there, in one sentence.
- Say which rotation fits best and the single biggest reason, in everyday words.
- Mention one risk to watch for. If soil facts are given and a risk is about the soil, prefer that one.
- End by suggesting they check with their agricultural extension officer.

Use only the numbers in the facts; never invent figures, prices or yields. Avoid jargon: say "adds natural fertiliser to the soil" rather than "fixes nitrogen". No headings, lists or markdown.`;

type ChatCompletion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
};

function isFacts(x: unknown): x is SummaryFacts {
  const f = x as SummaryFacts;
  return !!f && typeof f.place === "string" && Array.isArray(f.options) && f.options.length > 0 && !!f.climate;
}

export async function POST(request: Request): Promise<Response> {
  let facts: unknown;
  try {
    facts = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!isFacts(facts)) return Response.json({ error: "Missing summary facts." }, { status: 400 });

  const fallback: SummaryResponse = { text: templateSummary(facts), source: "template" };
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    console.warn("Summary: DEEPSEEK_API_KEY is not set, using the standard summary");
    return Response.json(fallback);
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // The model reasons before answering, and that counts towards this limit.
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await res.json()) as ChatCompletion;
    if (!res.ok) {
      console.error(`Summary: DeepSeek returned ${res.status}: ${data.error?.message ?? "no message"}`);
      return Response.json(fallback);
    }
    const choice = data.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text || choice?.finish_reason === "length") return Response.json(fallback);
    return Response.json({ text, source: "ai" } satisfies SummaryResponse);
  } catch (error) {
    console.error("Summary: DeepSeek request failed", error);
    return Response.json(fallback);
  }
}
