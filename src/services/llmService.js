const { getProvider } = require("../providers")
const { withRetry, isTransientError } = require("../utils/retry")

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callLLM({ model, messages, temperature, timeoutMs, maxRetries }) {
    // Resolve the model before calling a provider so unsupported models fail clearly.
    const provider = getProvider(model)

    if (!provider) {
        const error = new Error(`Unsupported model: ${model}`)
        error.code = "UNSUPPORTED_MODEL"
        error.statusCode = 400
        error.publicMessage = "The requested model is not supported."
        throw error
    }

    // Timeout: retries and provider calls share one deadline, not a fresh timeout each.
    const deadlineAt = Date.now() + timeoutMs
    const timeoutError = new Error("Provider request deadline exceeded")
    timeoutError.code = "PROVIDER_TIMEOUT"
    timeoutError.statusCode = 504
    timeoutError.publicMessage = "LLM provider timed out"

    try {
        // Retries: make at most the configured number of total provider calls.
        return await withRetry(
            async () => {
                const remainingMs = deadlineAt - Date.now()
                if (remainingMs <= 0) {
                    throw timeoutError
                }

                const controller = new AbortController()
                let timeoutId

                try {
                    // Timeout: abort this provider call when the shared deadline expires.
                    const timeout = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(timeoutError)
                            controller.abort()
                        }, remainingMs)
                    })

                    return await Promise.race([
                        Promise.resolve().then(() => provider.chat({
                            model,
                            messages,
                            temperature,
                            signal: controller.signal,
                        })),
                        timeout,
                    ])
                } finally {
                    clearTimeout(timeoutId)
                }
            },
            {
                maxAttempts: maxRetries,
                shouldRetry: isTransientError,
                sleep,
                deadlineAt,
            }
        )
    } catch (error) {
        // Error response: keep timeout errors recognizable and hide provider details.
        if (error === timeoutError) {
            throw error
        }

        const providerStatus = error && (error.statusCode || error.status)
        const statusCode = Number.isInteger(providerStatus)
            && providerStatus >= 400
            && providerStatus <= 599
            ? providerStatus
            : 502
        const publicError = new Error("The model provider request failed.")
        publicError.code = "PROVIDER_ERROR"
        publicError.statusCode = statusCode
        // Logging: retain only the numeric provider status for diagnostics; discard its message.
        publicError.providerStatusCode = Number.isInteger(providerStatus)
            ? providerStatus
            : null
        publicError.publicMessage = "The model provider request failed."
        throw publicError
    }
}

module.exports = { callLLM }
