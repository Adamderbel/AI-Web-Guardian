/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SAFE_BROWSING_API_KEY?: string;
  // TODO: MANUAL - Set this in your .env for Safe Browsing integration if you enable it
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
