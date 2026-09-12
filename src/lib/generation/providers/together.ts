import type { GenerateInput, ImageProvider } from "@/lib/types";
import { ProviderError } from "../retry";
import { fetchWithTimeout } from "./shared";

// Together AI FLUX.1 [schnell] — optional keyed text->image failover.
const TIMEOUT_MS = 60_000;
const MODEL = "black-forest-labs/FLUX.1-schnell";

export class TogetherProvider implements ImageProvider {
  readonly name = "together";
  readonly kind = "text-to-image" as const;

  constructor(private readonly apiKey: string) {}

  async generate(input: GenerateInput): Promise<string> {
    const res = await fetchWithTimeout(
      "https://api.together.xyz/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          prompt: input.stylePrompt,
          width: 1024,
          height: 1024,
          n: 1,
          response_format: "b64_json",
        }),
      },
      TIMEOUT_MS,
    );

    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, { status: res.status });

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("missing data[0].b64_json", { retryable: false });
    return `data:image/jpeg;base64,${b64}`;
  }
}
