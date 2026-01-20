# Checklist – Live Code Execution Backend (SWE Intern – Backend)

> Self-review checklist for the take-home assignment  
> Mark `[x]` when completed

---

## 1. Objective & Scope

- [ ] Clearly understand the goal: design a **secure, asynchronous backend** for code execution
- [ ] Identify the target users as **learners in a Job Simulation platform**
- [ ] Distinguish in-scope vs out-of-scope (no frontend, no real K8s orchestration)
- [ ] Treat this as a **case study with illustrative code**, not a production system

---

## 2. System Architecture

- [ ] Provide a high-level architecture diagram
- [ ] Clearly describe responsibilities of:
  - API Service
  - Queue system
  - Execution worker
  - Database / Storage
- [ ] Explain why a **queue-based asynchronous** architecture is used
- [ ] Show how API requests are kept **non-blocking**

---

## 3. Live Code Session

### 3.1 Create Live Code Session

- [ ] Implement `POST /code-sessions`
- [ ] Generate a `session_id` (UUID)
- [ ] Set default session status to `ACTIVE`
- [ ] Initialize programming language
- [ ] Provide template code (if applicable)
- [ ] Define a data model for code sessions

---

### 3.2 Autosave Code

- [ ] Implement `PATCH /code-sessions/{session_id}`
- [ ] Support high-frequency autosave
- [ ] Persist `language` and `source_code`
- [ ] Autosave **does not trigger execution**
- [ ] Session remains in `ACTIVE` state

---

## 4. Code Execution (Run Code)

### 4.1 Submit Execution

- [ ] Implement `POST /code-sessions/{session_id}/run`
- [ ] API responds **immediately**
- [ ] Return an `execution_id`
- [ ] Initial execution state is `QUEUED`
- [ ] No code execution in the API layer

---

### 4.2 Queue & Worker

- [ ] Use a job queue (Redis / BullMQ / Celery / equivalent)
- [ ] Worker runs independently from API service
- [ ] Executions are processed asynchronously
- [ ] Implement retry for transient failures
- [ ] Prevent system overload under high concurrency

---

## 5. Execution Lifecycle & State Management

- [ ] Define all execution states:
  - `QUEUED`
  - `RUNNING`
  - `COMPLETED`
  - `FAILED`
  - `TIMEOUT`
- [ ] Worker updates execution state step-by-step
- [ ] Track timestamps for key lifecycle events
- [ ] Handle:
  - Runtime errors
  - Execution timeouts
  - Worker crashes

---

## 6. Get Execution Result API

- [ ] Implement `GET /executions/{execution_id}`
- [ ] Return the current execution status
- [ ] When `COMPLETED`, return:
  - `stdout`
  - `stderr`
  - `execution_time_ms`
- [ ] When `FAILED` or `TIMEOUT`, return meaningful error information
- [ ] Do not expose sensitive system details

---

## 7. Safety & Resource Limits

- [ ] Enforce execution time limits (timeout)
- [ ] Enforce memory limits (conceptual explanation is sufficient)
- [ ] Restrict supported programming languages
- [ ] Protect against infinite loops
- [ ] Mitigate repeated or abusive execution requests

---

## 8. Observability & Logging

- [ ] Log the full execution lifecycle
- [ ] Track `QUEUED → RUNNING → COMPLETED / FAILED`
- [ ] Provide logs for worker debugging
- [ ] Explain how the system is monitored under load

---

## 9. Tech Stack & Infrastructure

- [ ] Clearly state the backend framework (Node.js / Python / Go / etc.)
- [ ] Justify the choice of queue system
- [ ] Use a database or Redis to store job metadata
- [ ] Provide a `Dockerfile`
- [ ] Provide a `docker-compose.yml`
- [ ] Use environment variables for configuration

---

## 10. Repository & Documentation

### 10.1 Code Structure

- [ ] Clearly separate:
  - API layer
  - Queue management
  - Worker
  - Execution logic
  - Data models
- [ ] Code is readable and well-organized

---

### 10.2 README.md

- [ ] Include setup instructions
- [ ] Describe the system architecture
- [ ] Document the APIs
- [ ] Explain design decisions
- [ ] List possible improvements with more time

---

### 10.3 DESIGN.md (or equivalent section)

- [ ] Describe the end-to-end request flow
- [ ] Explain the execution lifecycle
- [ ] Address idempotency
- [ ] Discuss scalability considerations
- [ ] Highlight technical trade-offs

---

## 11. Bonus (Optional)

- [ ] Unit tests
- [ ] Integration tests
- [ ] Failure scenario tests
- [ ] Optional deployed demo (Railway / Render / similar)

---
