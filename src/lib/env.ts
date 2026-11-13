/**
 * Read and validate environment variables.
 * Never log secret values from this module.
 */
export interface AppEnv {
  llmBaseUrl: string | undefined;
  llmApiKey: string | undefined;
  llmModel: string | undefined;
  githubToken: string | undefined;
  usecasecnApiUrl: string | undefined;
  usecasecnIngestToken: string | undefined;
  databasePath: string;
}

export const SECRET_ENV_NAMES = [
  "LLM_API_KEY",
  "GITHUB_TOKEN",
  "USECASECN_INGEST_TOKEN"
] as const;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  // TODO: validate with Zod once dependencies are installed.
  return {
    llmBaseUrl: source.LLM_BASE_URL || undefined,
    llmApiKey: source.LLM_API_KEY || undefined,
    llmModel: source.LLM_MODEL || undefined,
    githubToken: source.GITHUB_TOKEN || undefined,
    usecasecnApiUrl: source.USECASECN_API_URL || undefined,
    usecasecnIngestToken: source.USECASECN_INGEST_TOKEN || undefined,
    databasePath: source.DATABASE_PATH || "./data/harvester.db"
  };
}

export function assertClassifierConfig(env: AppEnv): void {
  if (!env.llmBaseUrl || !env.llmApiKey || !env.llmModel) {
    throw new Error(
      "Classifier is not configured. Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL."
    );
  }
}

export function assertIngestConfig(env: AppEnv): void {
  if (!env.usecasecnApiUrl || !env.usecasecnIngestToken) {
    throw new Error(
      "Push is not configured. Set USECASECN_API_URL and USECASECN_INGEST_TOKEN, or use JSON export."
    );
  }
}
