const express = require("express")
const { validateChatRequest } = require("../validation/chatRequest")
const { callLLM } = require("../services/llmService")

function createChatRouter(config) {
    const router = express.Router()

    router.post("/completions", async (req, res) => {
        // Reject malformed input before selecting a provider or making a model call.
        const validation = validateChatRequest(req.body)

        if (!validation.success) {
            res.locals.gatewayLog = { code: "INVALID_REQUEST" }
            return res.status(400).json({
                error: {
                    code: "INVALID_REQUEST",
                    message: validation.error.issues
                        .map((issue) => issue.message)
                        .join(", "),
                },
            })
        }

        try {
            const result = await callLLM({
                ...validation.data,
                timeoutMs: config.llmTimeoutMs,
                maxRetries: config.maxRetries,
            })

            // Logging: provide provider status and token counts to the shared response logger.
            res.locals.gatewayLog = {
                providerStatus: Number.isInteger(result.providerStatus)
                    ? result.providerStatus
                    : 200,
                usage: result.usage,
            }

            return res.json({
                id: req.requestId,
                model: result.model,
                message: result.message,
                usage: result.usage,
                latencyMs: Date.now() - req.requestStartedAt,
            })
        } catch (error) {
            const status = Number.isInteger(error.statusCode) ? error.statusCode : 500

            // Logging: share only safe status fields; don't expose provider error details.
            res.locals.gatewayLog = {
                providerStatus: Number.isInteger(error.providerStatusCode)
                    ? error.providerStatusCode
                    : null,
                code: error.code,
            }

            return res.status(status).json({
                error: {
                    code: error.code || "INTERNAL_ERROR",
                    message: error.publicMessage || "Internal server error",
                },
            })
        }
    })

    return router
}

module.exports = { createChatRouter }
