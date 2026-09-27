export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };

export type AiConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  fastModel: string;
  reasoningModel: string;
};

export function aiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER || "hermes-proxy";
  if (provider === "xai-api") {
    return {
      provider,
      baseUrl: "https://api.x.ai/v1",
      apiKey: process.env.XAI_API_KEY || "",
      fastModel: process.env.AI_FAST_MODEL || "grok-4.20-non-reasoning",
      reasoningModel: process.env.AI_REASONING_MODEL || "grok-4.20-reasoning",
    };
  }
  if (provider === "openai-compatible") {
    return {
      provider,
      baseUrl: process.env.OPENAI_BASE_URL || "",
      apiKey: process.env.OPENAI_API_KEY || "",
      fastModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      reasoningModel: process.env.OPENAI_MODEL || "gpt-4.1",
    };
  }
  return {
    provider: "hermes-proxy",
    baseUrl: process.env.AI_BASE_URL || "http://127.0.0.1:8645/v1",
    apiKey: process.env.AI_API_KEY || "local",
    fastModel: process.env.AI_FAST_MODEL || "grok-4.20-non-reasoning",
    reasoningModel: process.env.AI_REASONING_MODEL || "grok-4.20-reasoning",
  };
}

export async function aiHealth(): Promise<{ ok: boolean; provider: string; detail: string }> {
  const config = aiConfig();
  if (!config.baseUrl || !config.apiKey) return { ok: false, provider: config.provider, detail: "還沒設定 AI 端點" };
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, provider: config.provider, detail: `模型清單回應 ${res.status}` };
    return { ok: true, provider: config.provider, detail: config.provider === "hermes-proxy" ? "Hermes proxy · xAI Grok OAuth" : config.provider };
  } catch (error) {
    return { ok: false, provider: config.provider, detail: error instanceof Error ? error.message : "連不上" };
  }
}

export async function complete(input: {
  messages: ChatMessage[];
  reasoning?: boolean;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const config = aiConfig();
  if (!config.baseUrl || !config.apiKey) throw new Error("AI 尚未設定。請先啟動 Hermes proxy，或設定 XAI_API_KEY。");
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.reasoning ? config.reasoningModel : config.fastModel,
      temperature: input.temperature ?? (input.reasoning ? 0.3 : 0.2),
      messages: input.messages,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`AI 回應失敗（${res.status}）：${raw.slice(0, 240)}`);
  const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 沒有回傳內容");
  return content;
}

export function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!raw || !raw.includes("{")) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
