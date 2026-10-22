const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504])

function isTransientError(error) {
    const statusCode = error && (error.statusCode || error.status)
    return TRANSIENT_STATUS_CODES.has(statusCode)
}

async function withRetry(
    operation,
    { maxAttempts, shouldRetry = isTransientError, sleep, deadlineAt = Infinity }
) {
    // Retries: allow one to three total calls, even if configuration asks for more.
    const attemptLimit = Number.isFinite(maxAttempts)
        ? Math.min(3, Math.max(1, Math.floor(maxAttempts)))
        : 1
    let attempt = 0

    while (attempt < attemptLimit) {
        try {
            return await operation(attempt + 1)
        } catch (error) {
            attempt += 1

            // Retries: stop immediately for permanent errors or when all calls were used.
            if (attempt >= attemptLimit || !shouldRetry(error)) {
                throw error
            }

            // Retries: wait twice as long after each failure (100ms, 200ms, ...),
            // but never start another call if its backoff would pass the deadline.
            const backoffMs = 100 * (2 ** (attempt - 1))
            if (Date.now() + backoffMs >= deadlineAt) {
                throw error
            }

            await sleep(backoffMs)
        }
    }
}

module.exports = { isTransientError, withRetry }
