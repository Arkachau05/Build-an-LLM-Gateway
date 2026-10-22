function createRateLimiter({ maxRequests, windowMs }) {
    // Rate limiting: store a separate request counter and reset time for every API key.
    const clients = new Map()
    let lastCleanupAt = Date.now()

    // Rate limiting: allow up to maxRequests per key during its current fixed window.
    return (req, res, next) => {
        const key = req.apiKey
        const now = Date.now()

        // Rate limiting: periodically remove expired keys so inactive clients don't
        // leave old entries in memory forever.
        if (now - lastCleanupAt >= windowMs) {
            for (const [clientKey, window] of clients) {
                if (window.resetAt <= now) {
                    clients.delete(clientKey)
                }
            }
            lastCleanupAt = now
        }

        let clientWindow = clients.get(key)

        // Start a fresh window for new clients or clients whose previous window ended.
        if (!clientWindow || clientWindow.resetAt <= now) {
            clientWindow = {
                count: 0,
                resetAt: now + windowMs,
            }
            clients.set(key, clientWindow)
        }

        if (clientWindow.count >= maxRequests) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((clientWindow.resetAt - now) / 1000)
            )

            res.locals.gatewayLog = { code: "RATE_LIMIT_EXCEEDED" }
            res.set("Retry-After", String(retryAfterSeconds))
            res.set("RateLimit-Limit", String(maxRequests))
            res.set("RateLimit-Remaining", "0")
            res.set("RateLimit-Reset", String(Math.ceil(clientWindow.resetAt / 1000)))

            return res.status(429).json({
                error: {
                    code: "RATE_LIMIT_EXCEEDED",
                    message: `Request limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
                },
            })
        }

        clientWindow.count += 1
        res.set("RateLimit-Limit", String(maxRequests))
        res.set("RateLimit-Remaining", String(maxRequests - clientWindow.count))
        res.set("RateLimit-Reset", String(Math.ceil(clientWindow.resetAt / 1000)))

        next()
    }
}

module.exports = { createRateLimiter }
