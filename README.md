# AI Coding Round 01 — Build an LLM Gateway

## Overview

Build a small production-ready **LLM Gateway** that exposes a single API for sending chat requests to an LLM provider.

The gateway should hide provider-specific details from clients and add common backend capabilities such as validation, model selection, rate limiting, retries, timeouts, and request logging.

You are free to improve the internal architecture, but the public API contract described below must remain compatible.

## What You Need To Build

Implement the missing functionality marked with `TODO` in the starter repository.

Your gateway should support:

1. Request validation
2. Model/provider selection
3. Per-client rate limiting
4. Timeout handling
5. Retries for transient provider failures
6. Consistent error responses
7. Basic request/response logging
8. Token-usage and latency reporting

## API

### `POST /v1/chat/completions`

Request:

```json
{
  "model": "mock-small",
  "messages": [
    { "role": "user", "content": "Explain RAG in one sentence." }
  ],
  "temperature": 0.2
}
```

The client must send an `x-api-key` header.

Successful response:

```json
{
  "id": "req_123",
  "model": "mock-small",
  "message": {
    "role": "assistant",
    "content": "..."
  },
  "usage": {
    "promptTokens": 10,
    "completionTokens": 20,
    "totalTokens": 30
  },
  "latencyMs": 120
}
```

## Expected Behaviour

### Validation

- `model` is required.
- `messages` must contain at least one message.
- Each message must have a valid `role` and non-empty `content`.
- `temperature`, when provided, must be between `0` and `2`.
- Invalid requests should return HTTP `400`.

### Authentication

Require an `x-api-key` header.

Missing API keys should return HTTP `401`.

For this exercise, you do not need to build a user database or JWT authentication.

### Model Selection

The gateway should route requests to the correct provider based on the requested model.

The starter repository contains a mock provider so the application can run without an external LLM API.

Keep provider-specific logic behind the provider interface.

### Rate Limiting

Implement a per-API-key rate limiter.

Default configuration:

- 5 requests
- 60-second window

When the limit is exceeded, return HTTP `429`.

The gateway includes a `Retry-After` header that tells the client how many seconds
to wait before retrying. The current in-memory limiter keeps each API key's counter
separate within this server process.

The implementation should not block unrelated API keys.

### Timeout

Provider calls must have a configurable timeout.

Default:

- 5 seconds

The timeout can be changed with the `LLM_TIMEOUT_MS` environment variable (in
milliseconds). If a provider takes longer than the configured timeout, the gateway
returns HTTP `504`.

### Retries

Retry transient provider failures such as:

- HTTP `429`
- HTTP `500`
- HTTP `502`
- HTTP `503`
- HTTP `504`

Requirements:

- Maximum 3 total attempts.
- Use exponential backoff (100ms, then 200ms).
- Do not retry validation or authentication errors.
- All attempts and backoff waits share the configured provider timeout deadline.
- Do not retry if the next backoff would exceed that deadline.

### Error Response

Use a consistent structure:

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "LLM provider timed out"
  }
}
```

Provider failures use the same `error.code` and `error.message` structure. The
gateway returns safe public messages and does not expose internal stack traces or
provider error details/secrets.

### Logging

Log enough information to troubleshoot a request:

- Request ID
- Model
- hashed API key identifier (never log the full key)
- Latency
- HTTP response status and provider status, when available
- Token usage, when available
- Final outcome

The gateway writes structured JSON logs when a request is received and when its
response is sent. Request bodies, raw API keys, and provider error messages are not
logged. API key identifiers are one-way hashes. Latency and token usage are also
returned in successful API responses.

## Constraints

- Node.js 20+
- Keep the API server stateless apart from the in-memory rate limiter.
- Do not add a database.
- Do not hard-code provider secrets.
- Do not use a third-party rate-limit package; implement the exercise's rate limiter yourself.
- Keep provider-specific code isolated from HTTP/business logic.
- The application must remain testable without making real LLM API calls.

## Running The Project

```bash
npm install
npm test
npm run dev
```

The server starts on port `3000` by default.

You can change configuration using environment variables. See `.env.example`.

## What We Evaluate

We will evaluate more than whether the happy path works.

The evaluation may consider:

- Correctness and API behaviour
- Error handling
- Retry and timeout behaviour
- Rate-limiter correctness
- Code structure and separation of concerns
- Maintainability and readability
- Security considerations
- Test quality
- Production thinking

## Submission

Push your completed solution to a Git repository and submit the repository URL through the Techdose assessment platform.

Your repository **must also contain an `agent-log.md` file at the root**.

`agent-log.md` should contain the complete conversation/chat history with any AI coding agent you used while solving the problem. The agent log is part of the evaluation and may be used to understand your reasoning, design decisions, use of AI assistance, validation process, and understanding of the final implementation.

If you did not use an AI coding agent, create `agent-log.md` and state that clearly.

Do not commit secrets, API keys, or `.env` files containing credentials.
