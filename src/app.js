const express = require("express")
const config = require("./config")
const { requireApiKey } = require("./middleware/auth")
const { createRateLimiter } = require("./middleware/rateLimiter")
const { createRequestLogger, logRequestMetadata } = require("./middleware/requestLogger")
const { createChatRouter } = require("./routes/chat")

function createApp(overrides = {}) {
    // Allow tests and callers to replace selected defaults without changing global config.
    const appConfig = { ...config, ...overrides }
    const app = express()

    // Logging: attach before parsing so malformed chat requests still get a response log.
    app.use("/v1/chat", createRequestLogger())

    app.use(express.json({ limit: "1mb" }))
    app.use("/v1/chat", logRequestMetadata)

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" })
    })

    // Protect and throttle only the versioned chat API; health checks stay public.
    app.use(
        "/v1/chat",
        requireApiKey,
        createRateLimiter({
            maxRequests: appConfig.rateLimitMax,
            windowMs: appConfig.rateLimitWindowMs,
        }),
        createChatRouter(appConfig)
    )

    // Error response: convert malformed or oversized JSON body errors to safe JSON.
    app.use((error, _req, res, _next) => {
        if (error.type === "entity.parse.failed") {
            res.locals.gatewayLog = { code: "INVALID_JSON" }
            return res.status(400).json({
                error: {
                    code: "INVALID_JSON",
                    message: "Request body must be valid JSON.",
                },
            })
        }

        if (error.type === "entity.too.large") {
            res.locals.gatewayLog = { code: "REQUEST_TOO_LARGE" }
            return res.status(413).json({
                error: {
                    code: "REQUEST_TOO_LARGE",
                    message: "Request body exceeds the 1 MB limit.",
                },
            })
        }

        res.locals.gatewayLog = { code: "INTERNAL_ERROR" }
        return res.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Internal server error.",
            },
        })
    })

    return app
}

module.exports = { createApp }
