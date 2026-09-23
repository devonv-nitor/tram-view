/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Digitransit API key. Set in .env.local (git-ignored); see .env.example
   * and Docs/digitransit.md.
   */
  readonly VITE_DIGITRANSIT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
