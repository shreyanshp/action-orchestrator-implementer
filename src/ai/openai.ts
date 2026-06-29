// OpenAI API scaffolding.
//
// NOTE: This is intentionally UNUSED scaffolding — nothing in the app imports or
// calls it yet. It exists so an OpenAI-powered feature can be wired up later, for
// example: generating an instruction-set JSON from a natural-language task
// description, or producing spoken step-coaching. Set VITE_OPENAI_API_KEY in a
// .env file (see .env.example) before using it.

export interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  content: string;
  raw: unknown;
}

/**
 * Minimal fetch-based OpenAI Chat Completions client. Dependency-free so it adds
 * nothing to the bundle until it is actually imported and used.
 */
export class OpenAIClient {
  private config: OpenAIConfig;

  constructor(config: Partial<OpenAIConfig> = {}) {
    this.config = { ...DEFAULT_OPENAI_CONFIG, ...config };
  }

  /** True when an API key is present. */
  isConfigured(): boolean {
    return this.config.apiKey.length > 0;
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key not set (VITE_OPENAI_API_KEY).");
    }
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? this.config.model,
        temperature: options.temperature ?? 0.7,
        messages: options.messages,
      }),
      signal: options.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}`);
    }
    const data: unknown = await res.json();
    const content =
      (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
    return { content, raw: data };
  }
}

/** Convenience singleton (unused). */
export const openai = new OpenAIClient();
