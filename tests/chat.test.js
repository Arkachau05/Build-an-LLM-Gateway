const request = require("supertest")
const { createApp } = require("../src/app")
const { getProvider } = require("../src/providers")
import { describe, expect, it, vi } from "vitest"

const payload = {
    model: "mock-small",
    messages: [
        { role: "user", content: "What is RAG?" },
    ],
}

describe("POST /v1/chat/completions", () => {
    it("requires an API key", async () => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .send(payload)

        expect(response.status).toBe(401)
    })

    it("rejects a blank API key", async () => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "   ")
            .send(payload)

        expect(response.status).toBe(401)
    })

    it("validates the request body", async () => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "test-key")
            .send({ model: "mock-small", messages: [] })

        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe("INVALID_REQUEST")
    })

    it("returns a consistent JSON error for malformed JSON", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

        try {
            const response = await request(createApp())
                .post("/v1/chat/completions")
                .set("x-api-key", "test-key")
                .set("Content-Type", "application/json")
                .send("{")

            expect(response.status).toBe(400)
            expect(response.body).toEqual({
                error: {
                    code: "INVALID_JSON",
                    message: "Request body must be valid JSON.",
                },
            })
            const entries = logSpy.mock.calls.map(([line]) => JSON.parse(line))
            expect(entries).toHaveLength(2)
            expect(entries[1]).toMatchObject({
                event: "response_sent",
                httpStatus: 400,
                code: "INVALID_JSON",
                outcome: "error",
            })
        } finally {
            logSpy.mockRestore()
        }
    })

    it.each([
        ["missing model", { messages: payload.messages }],
        ["blank model", { ...payload, model: "   " }],
        ["missing messages", { model: payload.model }],
        ["empty message content", {
            ...payload,
            messages: [{ role: "user", content: "" }],
        }],
        ["blank message content", {
            ...payload,
            messages: [{ role: "user", content: "  " }],
        }],
        ["invalid message role", {
            ...payload,
            messages: [{ role: "developer", content: "Hello" }],
        }],
        ["temperature below the allowed range", { ...payload, temperature: -0.1 }],
        ["temperature above the allowed range", { ...payload, temperature: 2.1 }],
        ["temperature with the wrong type", { ...payload, temperature: "0.2" }],
    ])("returns HTTP 400 for %s", async (_caseName, invalidPayload) => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "test-key")
            .send(invalidPayload)

        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe("INVALID_REQUEST")
    })

    it.each([0, 2])("accepts temperature at the boundary %s", async (temperature) => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "test-key")
            .send({ ...payload, temperature })

        expect(response.status).toBe(200)
    })

    it("supports the mock provider", async () => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "test-key")
            .send(payload)

        expect(response.status).toBe(200)
        expect(response.body).toEqual({
            id: expect.stringMatching(/^req_/),
            model: "mock-small",
            message: {
                role: "assistant",
                content: expect.any(String),
            },
            usage: {
                promptTokens: expect.any(Number),
                completionTokens: expect.any(Number),
                totalTokens: expect.any(Number),
            },
            latencyMs: expect.any(Number),
        })
    })

    it("logs request and response metadata without exposing the API key", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const apiKey = "sensitive-test-api-key"

        try {
            const response = await request(createApp())
                .post("/v1/chat/completions")
                .set("x-api-key", apiKey)
                .send(payload)

            expect(response.status).toBe(200)
            const entries = logSpy.mock.calls
                .map(([line]) => JSON.parse(line))
            const requestLog = entries.find((entry) => entry.event === "request_received")
            const responseLog = entries.find((entry) => entry.event === "response_sent")

            expect(requestLog).toMatchObject({
                model: payload.model,
                outcome: "started",
            })
            expect(requestLog.apiKeyId).not.toBe(apiKey)
            expect(responseLog).toMatchObject({
                requestId: requestLog.requestId,
                model: payload.model,
                latencyMs: expect.any(Number),
                httpStatus: 200,
                providerStatus: 200,
                usage: response.body.usage,
                outcome: "success",
            })
            expect(JSON.stringify(entries)).not.toContain(apiKey)
            expect(requestLog.apiKeyId).toMatch(/^key_[a-f0-9]{12}$/)
        } finally {
            logSpy.mockRestore()
        }
    })

    it("logs requests rejected by authentication without logging a supplied key", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const apiKey = "   "

        try {
            const response = await request(createApp())
                .post("/v1/chat/completions")
                .set("x-api-key", apiKey)
                .send(payload)

            expect(response.status).toBe(401)
            const entries = logSpy.mock.calls.map(([line]) => JSON.parse(line))
            expect(entries).toHaveLength(2)
            expect(entries[0]).toMatchObject({
                event: "request_received",
                outcome: "started",
            })
            expect(entries[1]).toMatchObject({
                event: "response_sent",
                httpStatus: 401,
                outcome: "error",
                providerStatus: null,
            })
            expect(JSON.stringify(entries)).not.toContain(apiKey)
        } finally {
            logSpy.mockRestore()
        }
    })

    it("returns a client error when the model has no configured provider", async () => {
        const response = await request(createApp())
            .post("/v1/chat/completions")
            .set("x-api-key", "test-key")
            .send({ ...payload, model: "unknown-model" })

        expect(response.status).toBe(400)
        expect(response.body.error.code).toBe("UNSUPPORTED_MODEL")
    })

    it("returns HTTP 504 when the provider exceeds the configured timeout", async () => {
        const provider = getProvider("mock-small")
        const chatSpy = vi.spyOn(provider, "chat").mockImplementationOnce(
            ({ signal }) => new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("Provider aborted")), {
                    once: true,
                })
            })
        )

        try {
            const response = await request(createApp({ llmTimeoutMs: 10 }))
                .post("/v1/chat/completions")
                .set("x-api-key", "timeout-client")
                .send(payload)

            expect(response.status).toBe(504)
            expect(response.body.error).toEqual({
                code: "PROVIDER_TIMEOUT",
                message: "LLM provider timed out",
            })
        } finally {
            chatSpy.mockRestore()
        }
    })

    it("retries transient provider failures and succeeds on a later attempt", async () => {
        const provider = getProvider("mock-small")
        const originalChat = provider.chat.bind(provider)
        const chatSpy = vi.spyOn(provider, "chat")
            .mockRejectedValueOnce(Object.assign(new Error("temporary outage"), { status: 503 }))
            .mockImplementationOnce(originalChat)

        try {
            const response = await request(createApp({ maxRetries: 3 }))
                .post("/v1/chat/completions")
                .set("x-api-key", "retry-client")
                .send(payload)

            expect(response.status).toBe(200)
            expect(chatSpy).toHaveBeenCalledTimes(2)
        } finally {
            chatSpy.mockRestore()
        }
    })

    it("stops after three attempts and does not expose provider error details", async () => {
        const provider = getProvider("mock-small")
        const chatSpy = vi.spyOn(provider, "chat").mockImplementation(() => {
            const error = new Error("private provider token: secret-value")
            error.statusCode = 503
            return Promise.reject(error)
        })

        try {
            const response = await request(createApp({ maxRetries: 3 }))
                .post("/v1/chat/completions")
                .set("x-api-key", "retry-client")
                .send(payload)

            expect(response.status).toBe(503)
            expect(chatSpy).toHaveBeenCalledTimes(3)
            expect(response.body).toEqual({
                error: {
                    code: "PROVIDER_ERROR",
                    message: "The model provider request failed.",
                },
            })
            expect(JSON.stringify(response.body)).not.toContain("secret-value")
        } finally {
            chatSpy.mockRestore()
        }
    })

    it("does not retry provider authentication failures", async () => {
        const provider = getProvider("mock-small")
        const authError = Object.assign(
            new Error("provider credentials are private"),
            { statusCode: 401 }
        )
        const chatSpy = vi.spyOn(provider, "chat").mockRejectedValue(authError)

        try {
            const response = await request(createApp({ maxRetries: 3 }))
                .post("/v1/chat/completions")
                .set("x-api-key", "retry-client")
                .send(payload)

            expect(response.status).toBe(401)
            expect(chatSpy).toHaveBeenCalledTimes(1)
            expect(response.body.error.message).not.toContain("private")
        } finally {
            chatSpy.mockRestore()
        }
    })

    it("limits requests per API key and provides a retry time", async () => {
        const app = createApp({ rateLimitMax: 2, rateLimitWindowMs: 60_000 })
        const sendRequest = () => request(app)
            .post("/v1/chat/completions")
            .set("x-api-key", "limited-client")
            .send(payload)

        expect((await sendRequest()).status).toBe(200)
        expect((await sendRequest()).status).toBe(200)

        const limitedResponse = await sendRequest()
        expect(limitedResponse.status).toBe(429)
        expect(limitedResponse.body.error.code).toBe("RATE_LIMIT_EXCEEDED")
        expect(Number(limitedResponse.headers["retry-after"])).toBeGreaterThan(0)
    })

    it("does not apply one API key's limit to another key", async () => {
        const app = createApp({ rateLimitMax: 1, rateLimitWindowMs: 60_000 })
        const sendRequest = (apiKey) => request(app)
            .post("/v1/chat/completions")
            .set("x-api-key", apiKey)
            .send(payload)

        expect((await sendRequest("client-one")).status).toBe(200)
        expect((await sendRequest("client-one")).status).toBe(429)
        expect((await sendRequest("client-two")).status).toBe(200)
    })

    it("starts a new request window after the configured period", async () => {
        const app = createApp({ rateLimitMax: 1, rateLimitWindowMs: 1000 })
        const sendRequest = () => request(app)
            .post("/v1/chat/completions")
            .set("x-api-key", "window-client")
            .send(payload)

        expect((await sendRequest()).status).toBe(200)
        expect((await sendRequest()).status).toBe(429)
        await new Promise((resolve) => setTimeout(resolve, 1010))
        expect((await sendRequest()).status).toBe(200)
    })
})

describe("model provider selection", () => {
    it("routes models in the mock family to the mock provider", () => {
        expect(getProvider("mock-small").name).toBe("mock")
        expect(getProvider("mock-large").name).toBe("mock")
    })

    it.each(["unknown-model", "mock-", "", null])(
        "does not select a provider for unsupported model %s",
        (model) => {
            expect(getProvider(model)).toBeNull()
        }
    )
})
