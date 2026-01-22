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

## 3. Scalability Considerations

- Handling many concurrent live coding sessions
- Horizontal scaling of workers
- Queue backlog handling
- Potential bottlenecks and mitigation strategies

---

## 4. Trade-offs

- Technology choices and why
- What you optimized for (speed vs reliability vs simplicity)
- Production readiness gaps
