import { z } from "zod";

/**
 * Read and validate environment variables.
 * Never log secret values from this module. Validation errors name the
 * variable, never its value.
 */
export interface AppEnv {
  nodeEnv: "development" | "production" | "test";
  llmBaseUrl: string | undefined;
  llmApiKey: string | undefined;
  llmModel: string | undefined;
  githubToken: string | undefined;
  usecasecnApiUrl: string | undefined;
  usecasecnIngestToken: string | undefined;
  databasePath: string;
  /** Per-API request spacing overrides in milliseconds. */
  delaysMs: Partial<Record<"hn" | "github" | "reddit" | "usecasecn", number>>;
}

export const SECRET_ENV_NAMES = [
  "LLM_API_KEY",
  "GITHUB_TOKEN",
  "USECASECN_INGEST_TOKEN"
] as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Treat empty or whitespace-only values as unset. */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const optionalHttpUrl = optionalString.refine(
  (v) => {
    if (v === undefined) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  },
  { message: "must be an http(s) URL" }
);

const optionalDelay = optionalString
  .transform((v) => (v === undefined ? undefined : Number(v)))
  .pipe(z.number().int().min(0).max(600_000).optional());

const EnvSchema = z.object({
  NODE_ENV: z
    .string()
    .optional()
    .transform((v): AppEnv["nodeEnv"] =>
      v === "production" || v === "test" ? v : "development"
    ),
  LLM_BASE_URL: optionalHttpUrl,
  LLM_API_KEY: optionalString,
  LLM_MODEL: optionalString,
  GITHUB_TOKEN: optionalString,
  USECASECN_API_URL: optionalHttpUrl,
  USECASECN_INGEST_TOKEN: optionalString,
  DATABASE_PATH: optionalString.transform((v) => v ?? "./data/harvester.db"),
  HN_DELAY_MS: optionalDelay,
  GITHUB_DELAY_MS: optionalDelay,
  REDDIT_DELAY_MS: optionalDelay,
  USECASECN_DELAY_MS: optionalDelay
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Report variable names and rule messages only. Never echo input values.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration (${problems}).`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    llmBaseUrl: e.LLM_BASE_URL,
    llmApiKey: e.LLM_API_KEY,
    llmModel: e.LLM_MODEL,
    githubToken: e.GITHUB_TOKEN,
    usecasecnApiUrl: e.USECASECN_API_URL,
    usecasecnIngestToken: e.USECASECN_INGEST_TOKEN,
    databasePath: e.DATABASE_PATH,
    delaysMs: Object.fromEntries(
      (
        [
          ["hn", e.HN_DELAY_MS],
          ["github", e.GITHUB_DELAY_MS],
          ["reddit", e.REDDIT_DELAY_MS],
          ["usecasecn", e.USECASECN_DELAY_MS]
        ] as const
      ).filter(([, v]) => v !== undefined)
    )
  };
}

export function assertClassifierConfig(env: AppEnv): asserts env is AppEnv & {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
} {
  const missing = [
    !env.llmBaseUrl && "LLM_BASE_URL",
    !env.llmApiKey && "LLM_API_KEY",
    !env.llmModel && "LLM_MODEL"
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new ConfigError(
      `Classifier is not configured. Missing: ${missing.join(", ")}. Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL.`
    );
  }
}

export function assertIngestConfig(env: AppEnv): asserts env is AppEnv & {
  usecasecnApiUrl: string;
  usecasecnIngestToken: string;
} {
  const missing = [
    !env.usecasecnApiUrl && "USECASECN_API_URL",
    !env.usecasecnIngestToken && "USECASECN_INGEST_TOKEN"
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new ConfigError(
      `Push is not configured. Missing: ${missing.join(", ")}. JSON export is still available.`
    );
  }
}
