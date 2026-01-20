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
 * Default execution limits
 */
export const EXECUTION_LIMITS = {
  MAX_TIMEOUT_MS: 30000,
  MAX_MEMORY_MB: 256,
  DEFAULT_TIMEOUT_MS: 5000,
  DEFAULT_MEMORY_MB: 128,
} as const;

/**
 * Queue configuration
 */
export const QUEUE_CONFIG = {
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 1000,
  REMOVE_COMPLETED_AGE_SECONDS: 3600,
  REMOVE_COMPLETED_COUNT: 1000,
  RATE_LIMIT_MAX: 10,
  RATE_LIMIT_DURATION_MS: 1000,
} as const;

/**
 * Worker configuration
 */
export const WORKER_CONFIG = {
  DEFAULT_CONCURRENCY: 5,
  RATE_LIMIT_MAX: 10,
  RATE_LIMIT_DURATION_MS: 1000,
} as const;
