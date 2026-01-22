# Live Code Execution Backend - Design Document

## 1. Architecture Overview

### End-to-End Request Flow

#### Code Session Creation

![Code Session Creation Flow](/docs/images/create_session_flow.png)

1. User starts coding in the frontend
2. Frontend sends a request to create a new code session
3. API generates a UUID and stores the session in the database with status `ACTIVE`
4. API returns the session ID to the frontend
5. Frontend stores the session ID for subsequent API calls

#### Autosave Behavior

![Autosave Flow](/docs/images/autosave_flow.png)

1. User edits code in the frontend
2. Frontend sends autosave request to the API
3. API applies throttling to reduce database writes
4. API saves the latest code to the database
5. API responds with success

> **Note:** Throttling ensures that rapid keystrokes don't overwhelm the database. Only the latest code is saved after a short delay.

#### Execution Request

![Execution Request Flow](/docs/images/execution_request_flow.png)

1. User clicks "Run" in the frontend
2. Frontend sends an execute request to the API
3. API creates an execution record in the database with status `QUEUED`
4. API adds a job to the Redis queue
5. API returns the execution ID immediately

> **Note:** The API does not wait for code to run. It responds immediately and lets the Worker handle execution in the background.

#### Background Execution

![Background Execution Flow](/docs/images/background_execution_flow.png)

1. Worker picks up a job from the Redis queue
2. Worker updates the execution status to `RUNNING`
3. Worker executes the user's code in an isolated process
4. Worker saves the result (stdout, stderr, exit code) to the database
5. Worker updates the status to `COMPLETED`, `FAILED`, or `TIMEOUT`

> **Note:** The Worker runs code in an isolated child process with a timeout limit to prevent long-running or infinite loops.

#### Result Polling

![Result Polling Flow](/docs/images/result_polling_flow.png)

1. Frontend polls the API to check execution status
2. API queries the database for the execution record
3. API returns the current status and result (if available)
4. Frontend displays the result to the user

> **Note:** Frontend polls repeatedly until the status is `COMPLETED`, `FAILED`, or `TIMEOUT`.

---

### Queue-Based Execution Design

**Problem**  
Running user code takes time. If the API waits for code to finish, it becomes slow and blocks other users. The system also needs to handle crashes and retries without losing jobs.

**Design Decision**  
The system uses a message queue (Redis + BullMQ) to run code in the background. The API adds jobs to the queue and returns a response right away. A separate Worker process picks up jobs and runs the code.

**Why This Solution**

- The API stays fast because it does not wait for code to run.
- The API and Worker are separate, so they can scale on their own.
- BullMQ handles retries automatically if the Worker crashes.

**Trade-offs**

- This adds complexity. The system now has three parts: API, Redis, and Worker.
- Results are not available immediately. Clients must poll or wait for updates.
- Redis must stay running. If Redis goes down, new jobs cannot be added.

---

### Execution Lifecycle and State Management

**Problem**  
Code execution is not instant. The API creates the job, but the Worker runs it later. The system needs a way to track where each execution is in its lifecycle. Without clear state tracking, clients cannot know if their code is still waiting, running, or finished.

**Design Decision**  
The execution follows a simple linear lifecycle:

```
QUEUED → RUNNING → COMPLETED / FAILED / TIMEOUT
```

State ownership is split between the API and the Worker:

| State                              | Set by | Responsibility                  |
| ---------------------------------- | ------ | ------------------------------- |
| `QUEUED`                           | API    | Creates the execution record    |
| `RUNNING`                          | Worker | Picks up the job and starts it  |
| `COMPLETED` / `FAILED` / `TIMEOUT` | Worker | Writes final result to database |

**Why This Design**

- Each state has one clear owner. The API owns creation; the Worker owns execution.
- SQLite is the single source of truth. Both API and Worker write to the same database.
- The lifecycle is simple and easy to understand. No hidden states or complex transitions.

**Alternative Considered**  
BullMQ provides QueueEvents, which can notify listeners when jobs change state. This was considered as a way to track execution status. However, it was **not chosen** as the primary mechanism because:

- Queue events can be delayed, missed, or lost under load.
- Event delivery is not guaranteed after restarts or reconnections.
- Redis pub/sub is not a reliable source of truth.

The database remains the authoritative store for execution state. If QueueEvents are used, they should be treated as optional signals (e.g., to trigger cache updates), not as the main state source.

**Trade-offs**

- If the Worker crashes mid-execution, the state may stay as `RUNNING`. The system needs extra logic to detect stale jobs.
- Polling is required. Clients must keep asking for updates because the API does not push changes.
- Only one database is used. This keeps things simple but limits horizontal scaling.

---

## 2. Reliability & Data Model

### Execution States

**Problem**  
Distributed systems can fail at any point. If the Worker crashes while running code, the system needs a way to know the job was interrupted.

**How it works**  
The Worker updates the database when it starts a job (`RUNNING`) and when it finishes (`COMPLETED`, `FAILED`, or `TIMEOUT`). If the Worker crashes mid-execution:

1. BullMQ detects the stalled job and automatically retries it.
2. If all retries are exhausted, the `failed` event handler updates the database to `FAILED`.

**Guarantees**

- The database always reflects the last known state.
- Crashed jobs are automatically retried by BullMQ.
- Jobs that exhaust all retries are marked as `FAILED` in the database.

**Out of scope**

- A separate cleanup process for edge cases (e.g., database write failures during the `failed` event) is not implemented.

---

### Idempotency Handling

**Problem**  
Users may click "Run" multiple times quickly, or automated clients may send many requests. The system needs to prevent duplicate executions and protect against abuse.

**How it works**  
The API uses multiple layers of protection:

1. **Active execution check** — Before creating a job, the API checks if the session already has a `QUEUED` or `RUNNING` execution. If so, the request is rejected.
2. **Cooldown period** — After each execution, the session enters a short cooldown. Requests during this time are rejected.
3. **Rate limit** — Each session has a maximum number of executions per minute. Requests beyond this limit are rejected.
4. **Database constraint** — As a fallback, SQLite rejects duplicate execution IDs.

**Why multiple layers**

- The active execution check handles the normal case (user clicks Run twice).
- The cooldown prevents rapid-fire requests from the same session.
- The rate limit protects against abuse or buggy clients.
- The database constraint is a last-resort safety net.

**Out of scope**

- The Worker does not check the database before running. If BullMQ retries a job, the code may run again.
- True exactly-once execution is not guaranteed. If the Worker crashes after running code but before updating the database, the code may run again on retry.

---

### Failure Handling

**Problem**  
Jobs can fail for many reasons: code errors, timeouts, or system crashes. The system needs to handle these failures gracefully.

**How it works**

- BullMQ retries failed jobs a limited number of times.
- If all retries fail, the job is marked as `FAILED` in the database.
- The Worker catches errors and writes them to the database so clients can see what went wrong.

**Guarantees**

- Failed jobs are recorded with error details.
- Jobs do not disappear silently.

**Out of scope**

- A full dead-letter queue (DLQ) is not implemented. Failed jobs are stored in the database, but there is no automatic reprocessing or alerting system.

---

### Output Size Handling

**Problem**  
User code may produce excessive output (e.g., infinite loops printing to console). Without limits, this could exhaust memory and crash the worker.

**How it works**

1. **Real-time monitoring** — As the process runs, stdout and stderr are accumulated. If either exceeds 1MB (`MAX_OUTPUT_SIZE`), the process is killed immediately.
2. **Error message** — When killed for output overflow, stderr is set to "Output size limit exceeded".
3. **Final truncation** — Before returning results, output is truncated to 1MB as a safety net.

**Guarantees**

- The worker will not crash due to excessive output.
- Users receive a clear error message when output is too large.

---

## 3. Scalability Considerations

### Handling Many Concurrent Sessions

**Problem**  
Many users may code simultaneously. Each session generates autosave requests and execution requests. The system must handle this load without degrading performance.

**How it works**

- **Autosave throttling** — Each session is throttled to 1 DB write per second (`THROTTLE_MS: 1000`). Rapid keystrokes are coalesced, reducing database load.
- **Rate limiting per session** — Each session is limited to 5 executions per minute with a 2-second cooldown between runs. This prevents any single user from overwhelming the queue.
- **Stateless API** — The API server does not store session or execution state in memory. All state is stored in shared storage (SQLite for data, Redis for rate limits and queues). This means any API instance can handle any request, so you can run multiple API servers behind a load balancer to handle more traffic.

---

### Horizontal Scaling of Workers

**Problem**  
A single worker may not be able to process jobs fast enough during peak load. The system needs to scale workers independently.

**How it works**

- **Queue-based decoupling** — Workers pull jobs from Redis. Adding more worker instances increases throughput without code changes.
- **Concurrency limit** — Each worker runs up to 5 jobs in parallel (`CONCURRENCY: 5`). If 5 jobs are running, new jobs wait until one finishes.
- **Rate limit** — Each worker can start at most 10 new jobs per second (`RATE_LIMIT_MAX: 10`). This prevents burst traffic from overwhelming the worker even if slots are available.
- **Independent processes** — Workers are separate processes from the API. They can be deployed, scaled, and restarted independently.

**Scaling example**

| Workers | Concurrency | Max Throughput |
| ------- | ----------- | -------------- |
| 1       | 5           | ~10 jobs/sec   |
| 3       | 5           | ~30 jobs/sec   |
| 10      | 5           | ~100 jobs/sec  |

---

### Queue Backlog Handling

**Problem**  
If jobs arrive faster than workers can process them, the queue grows. The system needs strategies to handle backlogs gracefully.

**How it works**

- **Automatic cleanup** — Completed jobs are removed after 1 hour or when count exceeds 1000. Failed jobs are kept up to 1000 for debugging.
- **Staleness detection** — BullMQ's built-in stalled job detection checks every 30 seconds. If a worker crashes mid-execution, BullMQ retries the job automatically. After all retries are exhausted, the `failed` event handler marks the execution as `FAILED` in the database.
- **Backoff on retry** — Failed jobs use exponential backoff (`1s, 2s, 4s...`) to avoid retry storms.

**Current limits**

- No queue size limit is enforced. Under extreme load, Redis memory could grow unbounded.
- No priority queue. All jobs are processed in FIFO order.

---

### Potential Bottlenecks and Mitigations

| Bottleneck                  | Current Mitigation             | Future Improvement                          |
| --------------------------- | ------------------------------ | ------------------------------------------- |
| **SQLite write contention** | Single DB, autosave throttling | Migrate to PostgreSQL for concurrent writes |
| **Redis memory**            | Job cleanup policies           | Add queue size limits, reject when full     |
| **Worker CPU**              | Concurrency + rate limiting    | Horizontal scaling, Kubernetes HPA          |
| **Code execution timeout**  | 5-second timeout per job       | Configurable per language                   |
| **Large output handling**   | 1MB output limit               | Stream output, truncate earlier             |

---

## 4. Trade-offs

### Technology Choices

| Technology         | Why Chosen                                                                          | Trade-off                                                                |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **SQLite**         | Zero setup, file-based, perfect for development and small deployments               | Not suitable for multiple API instances writing concurrently             |
| **Redis + BullMQ** | Battle-tested job queue with retries, stalled detection, and rate limiting built-in | Adds operational complexity (Redis must be running and monitored)        |
| **Child Process**  | Simple isolation without containerization overhead                                  | Less secure than Docker/gVisor; relies on OS-level timeout/memory limits |
| **TypeScript**     | Type safety, better IDE support, easier refactoring                                 | Build step required; slightly larger codebase                            |

---

### What Was Optimized For

| Priority           | Description                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Simplicity**  | Single SQLite database, in-memory rate limiting with Redis, no complex orchestration                                                      |
| **2. Reliability** | BullMQ handles retries, stalled jobs, and graceful shutdown automatically                                                                 |
| **3. Speed**       | Async queue returns immediately; no blocking on code execution                                                                            |
| **4. Safety**      | Output limits, timeout limits, memory limits, rate limiting, and spam protection prevent abuse and protect the worker from malicious code |

**Not optimized for:**

- High availability (single SQLite database is a single point of failure)
- Horizontal API scaling (SQLite doesn't support concurrent writes well)
- Sub-second execution latency (queue adds slight delay)

---

### Production Readiness Gaps

| Gap                     | Current State              | To Be Production-Ready                                 |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| **Database**            | SQLite (single-writer)     | Migrate to PostgreSQL with connection pooling          |
| **Container isolation** | Child process with timeout | Use Docker or gVisor for stronger sandboxing           |
| **Monitoring**          | Console logs only          | Add structured logging, metrics (Prometheus), alerting |
| **Authentication**      | None                       | Add API keys or OAuth for session ownership            |
| **HTTPS**               | Not configured             | Add TLS termination via reverse proxy                  |
| **Rate limiting**       | Per-session only           | Add IP-based rate limiting to prevent abuse            |
| **Queue monitoring**    | None                       | Add BullMQ dashboard (Bull Board) for visibility       |
