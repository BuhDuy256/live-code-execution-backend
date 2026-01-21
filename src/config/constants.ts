/**
 * Graceful shutdown signals for Queue
 *
 * SIGINT  - Interrupt signal (Ctrl + C during local development)
 * SIGTERM - Termination signal (OS, Docker, Kubernetes shutdown)
 * SIGQUIT - Quit signal (debugging purposes, kill -3)
 */
export const QUEUE_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGQUIT"];

/**
 * Graceful shutdown signals for Worker
 *
 * SIGINT  - Interrupt signal (Ctrl + C during local development)
 * SIGTERM - Termination signal (OS, Docker, Kubernetes shutdown)
 */
export const WORKER_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/**
 * Centralized language configuration
 * Contains all language-specific settings: template, fileName, and execution command
 */
export const LANGUAGE_CONFIG = {
  javascript: {
    fileName: "main.js",
    command: "node",
    args: [] as string[],
    template: `// JavaScript Template
console.log('Hello, World!');

// Write your code here
`,
  },

  python: {
    fileName: "main.py",
    command: "python3",
    args: [] as string[],
    template: `# Python Template
print('Hello, World!')

# Write your code here
`,
  },

  java: {
    fileName: "Main.java",
    command: "java",
    args: [] as string[],
    template: `// Java Template
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        // Write your code here
    }
}
`,
  },
} as const;

/**
 * Supported programming languages for code execution
 * Automatically derived from LANGUAGE_CONFIG
 */
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG) as Array<keyof typeof LANGUAGE_CONFIG>;

export type SupportedLanguage = keyof typeof LANGUAGE_CONFIG;

/**
 * Code templates for each supported language
 * Automatically derived from LANGUAGE_CONFIG for backward compatibility
 */
export const CODE_TEMPLATES = Object.fromEntries(
  Object.entries(LANGUAGE_CONFIG).map(([lang, config]) => [lang, config.template])
) as Record<SupportedLanguage, string>;

/**
 * Default execution limits
 */
export const EXECUTION_LIMITS = {
  TIMEOUT_MS: 5000,
  MEMORY_MB: 128,
} as const;

/**
 * API Rate Limiting (per session/IP)
 * Applied at controller layer to prevent spam before queuing
 */
export const API_RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,        // Max executions per session per minute
  COOLDOWN_BETWEEN_RUNS_MS: 2000,     // Minimum 2s between runs
} as const;

/**
 * Queue configuration
 */
export const QUEUE_CONFIG = {
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 1000,
  REMOVE_COMPLETED_AGE_SECONDS: 3600,
  REMOVE_COMPLETED_COUNT: 1000,
} as const;

/**
 * Worker configuration
 */
export const WORKER_CONFIG = {
  CONCURRENCY: 5,                     // Process 5 jobs concurrently
  RATE_LIMIT_MAX: 10,                 // Process max 10 jobs
  RATE_LIMIT_DURATION_MS: 1000,       // Per 1 second
} as const;

/**
 * Maximum output size from code execution
 */
export const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
