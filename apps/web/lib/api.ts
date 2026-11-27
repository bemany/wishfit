// Client for the agent backend, see docs/api.md. Mock mode lives at the bottom of this file.
import simpleRequest from "./examples/simple.request.json";
import chaoticRequest from "./examples/chaotic.request.json";
import sampleResponse from "./examples/sample.response.json";
import clarificationResponse from "./examples/sample.clarification.response.json";
import chatRequest from "./examples/chat.request.json";
import chatResponse from "./examples/sample.chat.response.json";
import ideasResponse from "./examples/sample.ideas.response.json";

export type Signal = { type: string; label: string; value: string };

export type Recommendation = {
  wish: string;
  product_name: string;
  action: "buy" | "wait" | "alternative";
  reason: string;
  price_eur: number | null;
  shipping_eur: number | null;
  total_eur: number | null;
  merchant: string | null;
  offer_url: string | null;
  image_url: string | null;
  available: boolean | null;
  delivery_estimate: string | null;
  signals: Signal[];
};

export type Result = {
  id: string;
  status: "recommendation" | "needs_clarification" | "ideas_only";
  understood?: { summary: string; interests: string[]; candidates: { idea: string; why: string }[] } | null;
  top: Recommendation | null;
  alternatives: Recommendation[];
  uncertainty: { reasons: string[]; question: string } | null;
  model: string;
  trace_url: string;
  created_at: string;
};

export type RecommendRequest = {
  input_text?: string;
  wishes?: string[];
  budget_eur: number;
  occasion: string;
  recipient_name?: string | null;
  preferences?: string | null;
  demo_case?: "simple" | "chaotic" | "chat";
};

export type Trace = {
  id: string;
  model_calls: {
    step?: string;
    model: string;
    input: { role: string; content: string }[];
    output: string;
    started_at?: string;
    duration_ms?: number;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }[];
  idealo_calls: {
    tool: string;
    arguments: unknown;
    result: unknown;
    duration_ms?: number;
    source?: string;
  }[];
};

export const demoRequests = {
  simple: simpleRequest as RecommendRequest,
  chaotic: chaoticRequest as RecommendRequest,
  chat: chatRequest as RecommendRequest,
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Der Agent ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : `Fehler ${res.status}`,
    );
  }
  return data as T;
}

export const recommend = (req: RecommendRequest) =>
  USE_MOCK ? mock.recommend(req) : call<Result>("/recommend", req);

export const getResult = (id: string) =>
  USE_MOCK ? mock.result(id) : call<Result>(`/results/${encodeURIComponent(id)}`);

export const getTrace = (id: string) =>
  USE_MOCK ? mock.trace(id) : call<Trace>(`/trace/${encodeURIComponent(id)}`);

// --- Mock mode (NEXT_PUBLIC_USE_MOCK=1): the sample responses instead of the backend ---
const samples = { simple: sampleResponse, chaotic: clarificationResponse, chat: chatResponse, ideas: ideasResponse } as Record<
  string,
  Result
>;
const later = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 800));

const mock = {
  recommend: (req: RecommendRequest) => later(samples[req.demo_case ?? (req.input_text ? "ideas" : "simple")]),
  result: (id: string) => later(Object.values(samples).find((s) => s.id === id) ?? samples.simple),
  trace: (id: string) =>
    later<Trace>({
      id,
      model_calls: [
        {
          step: "decide",
          model: "example-model",
          input: [
            { role: "system", content: "Du bist ein Geschenkberater. Entscheide: kaufen, warten oder Alternative." },
            { role: "user", content: "Wunsch: Anker PowerCore 20000 mAh Powerbank, Budget 50 €" },
          ],
          output: '{"action": "buy", "reason": "Preis unter dem 90-Tage-Tief, im Budget."}',
          duration_ms: 1234,
          usage: { prompt_tokens: 512, completion_tokens: 96 },
        },
      ],
      idealo_calls: [
        {
          tool: "search_products",
          arguments: { query: "Anker PowerCore 20000" },
          result: { offers: 6, min_price_eur: 39.99 },
          duration_ms: 321,
          source: "snapshot",
        },
      ],
    }),
};
