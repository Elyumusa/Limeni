/**
 * POST /api/soil-report  (multipart form, field "file": a photo or PDF of a soil test)
 * Returns { soil, found } with the values DeepSeek could read, for the farmer
 * to check before they are used. Nothing is stored.
 *
 * Photos go to DeepSeek as images. PDFs have their text extracted first; a
 * scanned PDF with no text asks the farmer for a photo instead.
 */
import { extractText, getDocumentProxy } from "unpdf";
import { textureFromClass, textureFromParticles, type SoilInfo } from "@/lib/soil";

export const maxDuration = 60;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-flash";
const MAX_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const SYSTEM = `You read soil test reports for farmers. Return only JSON with these keys:
- "is_soil_report": true if this is a soil test or soil analysis, else false
- "ph": the soil pH number, or null
- "ph_method": "water", "CaCl2" or "KCl" if the report says how pH was measured, else null
- "texture_class": the texture class name as printed (e.g. "Sandy loam"), or null
- "sand_pct", "clay_pct": numbers in percent, or null
- "organic_carbon_pct": organic carbon in percent, or null
- "organic_matter_pct": organic matter in percent, or null
- "drainage": "well" or "poor" only if the report states it, else null
Copy only values printed in the report. Never estimate or calculate a value that is not there. If several samples are listed, use the first topsoil sample.`;

type Extracted = {
  is_soil_report?: boolean;
  ph?: number | null;
  ph_method?: string | null;
  texture_class?: string | null;
  sand_pct?: number | null;
  clay_pct?: number | null;
  organic_carbon_pct?: number | null;
  organic_matter_pct?: number | null;
  drainage?: string | null;
};

const num = (x: unknown, min: number, max: number) =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : undefined;

/** Turns the model's reading into checked SoilInfo, plus a list of what was found. */
function toSoil(e: Extracted): { soil: SoilInfo; found: string[] } {
  const soil: SoilInfo = {};
  const found: string[] = [];
  const ph = num(e.ph, 3, 10);
  if (ph !== undefined) {
    soil.ph = ph;
    // KCl reads close to CaCl2, so it is treated the same way.
    soil.phMethod = e.ph_method === "CaCl2" || e.ph_method === "KCl" ? "CaCl2" : "water";
    found.push(`pH ${ph}${e.ph_method ? ` (${e.ph_method})` : ""}`);
  }
  const texture =
    (e.texture_class ? textureFromClass(e.texture_class) : undefined) ??
    textureFromParticles(num(e.sand_pct, 0, 100), num(e.clay_pct, 0, 100));
  if (texture) {
    soil.texture = texture;
    found.push(e.texture_class ? `texture: ${e.texture_class}` : "texture from sand and clay");
  }
  const oc = num(e.organic_carbon_pct, 0, 30);
  const om = num(e.organic_matter_pct, 0, 50);
  if (oc !== undefined) {
    soil.organicCarbonPct = oc;
    found.push(`organic carbon ${oc}%`);
  } else if (om !== undefined) {
    // Organic matter is about 1.72 times organic carbon (the van Bemmelen factor).
    soil.organicCarbonPct = +(om / 1.72).toFixed(2);
    found.push(`organic matter ${om}%`);
  }
  if (e.drainage === "well" || e.drainage === "poor") {
    soil.drainage = e.drainage;
    found.push(`drainage: ${e.drainage}`);
  }
  return { soil, found };
}

export async function POST(request: Request): Promise<Response> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return Response.json({ error: "Reading reports isn't set up on this server. Enter the values by hand." }, { status: 503 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    /* handled below */
  }
  if (!file) return Response.json({ error: "No file was uploaded." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 6 MB. Try a smaller photo." }, { status: 413 });

  let content: unknown;
  if (IMAGE_TYPES.includes(file.type)) {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    content = [
      { type: "text", text: "Here is a photo of the soil report." },
      { type: "image_url", image_url: { url: `data:${file.type};base64,${b64}` } },
    ];
  } else if (file.type === "application/pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const { text } = await extractText(pdf, { mergePages: true });
      if (text.replace(/\s/g, "").length < 30)
        return Response.json(
          { error: "This PDF looks like a scan with no readable text. Upload a photo or screenshot of it instead." },
          { status: 422 },
        );
      content = `Here is the text of the soil report:\n\n${text.slice(0, 20000)}`;
    } catch {
      return Response.json({ error: "Couldn't open that PDF. Try a photo of the report instead." }, { status: 422 });
    }
  } else {
    return Response.json({ error: "Upload a photo (JPG, PNG) or a PDF." }, { status: 415 });
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) {
      console.error(`Soil report: DeepSeek returned ${res.status}: ${data.error?.message ?? ""}`);
      return Response.json({ error: "Couldn't read the report right now. Enter the values by hand." }, { status: 502 });
    }
    const extracted = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Extracted;
    if (extracted.is_soil_report === false)
      return Response.json({ error: "That doesn't look like a soil test report." }, { status: 422 });
    const result = toSoil(extracted);
    if (result.found.length === 0)
      return Response.json({ error: "No pH, texture or organic carbon values were found in that file." }, { status: 422 });
    return Response.json(result);
  } catch (error) {
    console.error("Soil report: reading failed", error);
    return Response.json({ error: "Couldn't read the report right now. Enter the values by hand." }, { status: 502 });
  }
}
