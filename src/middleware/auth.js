const crypto = require("node:crypto")

function createApiKeyId(apiKey) {
    // Logging: derive a non-reversible identifier instead of exposing key characters.
    return `key_${crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 12)}`
}

function requireApiKey(req, res, next) {
    const apiKey = req.header("x-api-key")

    // Request validation: require a present, non-blank API key before protected routes run.
    if (!apiKey || apiKey.trim().length === 0) {
        res.locals.gatewayLog = { code: "MISSING_API_KEY" }
        return res.status(401).json({
            error: {
                code: "MISSING_API_KEY",
                message: "x-api-key header is required",
            },
        })
    }

    // Authentication: keep the raw key only for rate limiting; logs use its hash ID.
    req.apiKey = apiKey
    req.apiKeyId = createApiKeyId(apiKey)

    next()
}

module.exports = { createApiKeyId, requireApiKey }
