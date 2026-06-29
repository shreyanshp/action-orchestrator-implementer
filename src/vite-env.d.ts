/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OpenAI API key for the (currently unused) AI scaffolding. */
  readonly VITE_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
