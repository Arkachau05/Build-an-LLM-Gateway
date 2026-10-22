const { requestId } = require("../utils/requestId")
const { createApiKeyId } = require("./auth")

function createRequestLogger() {
    // Logging: create safe request metadata before auth or rate limiting can reject it.
    return (req, res, next) => {
        const startedAt = Date.now()
        const id = requestId()
        const apiKey = req.header("x-api-key")
        const apiKeyId = apiKey && apiKey.trim()
            ? createApiKeyId(apiKey)
            : null
        req.requestId = id
        req.requestStartedAt = startedAt
        req.requestedModel = null
        req.requestLogApiKeyId = apiKeyId
        req.requestLogged = false

        // Logging: capture the final HTTP response, including auth and rate-limit rejections.
        res.on("finish", () => {
            const details = res.locals.gatewayLog || {}
            if (!req.requestLogged) {
                // Logging: malformed JSON fails before parsing can supply a model name.
                console.log(JSON.stringify({
                    event: "request_received",
                    requestId: id,
                    model: null,
                    apiKeyId,
                    outcome: "started",
                }))
            }

            const responseLog = {
                event: "response_sent",
                requestId: id,
                model: req.requestedModel || null,
                apiKeyId: req.apiKeyId || req.requestLogApiKeyId,
                latencyMs: Date.now() - startedAt,
                httpStatus: res.statusCode,
                providerStatus: Number.isInteger(details.providerStatus)
                    ? details.providerStatus
                    : null,
                outcome: res.statusCode < 400 ? "success" : "error",
            }

            if (details.usage !== undefined) {
                responseLog.usage = details.usage
            }
            if (details.code) {
                responseLog.code = details.code
            }

            console.log(JSON.stringify(responseLog))
        })

        next()
    }
}

function logRequestMetadata(req, _res, next) {
    const model = typeof req.body?.model === "string" ? req.body.model : null
    req.requestedModel = model
    req.requestLogged = true

    // Logging: record model metadata after parsing without logging body or raw key.
    console.log(JSON.stringify({
        event: "request_received",
        requestId: req.requestId,
        model,
        apiKeyId: req.requestLogApiKeyId,
        outcome: "started",
    }))

    next()
}

module.exports = { createRequestLogger, logRequestMetadata }
