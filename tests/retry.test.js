import { describe, expect, it, vi } from "vitest"
const { isTransientError, withRetry } = require("../src/utils/retry")

describe("withRetry", () => {
    it.each([429, 500, 502, 503, 504])(
        "recognizes HTTP %s as a transient provider failure",
        (statusCode) => {
            expect(isTransientError({ statusCode })).toBe(true)
        }
    )

    it("uses exponential backoff and returns a later successful result", async () => {
        const sleep = vi.fn().mockResolvedValue(undefined)
        const operation = vi.fn()
            .mockRejectedValueOnce({ statusCode: 503 })
            .mockRejectedValueOnce({ statusCode: 502 })
            .mockResolvedValue("success")

        await expect(withRetry(operation, {
            maxAttempts: 3,
            sleep,
        })).resolves.toBe("success")

        expect(operation).toHaveBeenCalledTimes(3)
        expect(sleep.mock.calls).toEqual([[100], [200]])
    })

    it("never makes more than three total attempts", async () => {
        const sleep = vi.fn().mockResolvedValue(undefined)
        const operation = vi.fn().mockRejectedValue({ statusCode: 503 })

        await expect(withRetry(operation, {
            maxAttempts: 10,
            sleep,
        })).rejects.toMatchObject({ statusCode: 503 })

        expect(operation).toHaveBeenCalledTimes(3)
        expect(sleep.mock.calls).toEqual([[100], [200]])
    })

    it("does not retry a non-transient error", async () => {
        const sleep = vi.fn()
        const operation = vi.fn().mockRejectedValue({ statusCode: 401 })

        await expect(withRetry(operation, {
            maxAttempts: 3,
            sleep,
        })).rejects.toMatchObject({ statusCode: 401 })

        expect(operation).toHaveBeenCalledTimes(1)
        expect(sleep).not.toHaveBeenCalled()
    })

    it("does not wait or start another attempt if backoff exceeds the deadline", async () => {
        const sleep = vi.fn()
        const operation = vi.fn().mockRejectedValue({ statusCode: 503 })

        await expect(withRetry(operation, {
            maxAttempts: 3,
            sleep,
            deadlineAt: Date.now() + 50,
        })).rejects.toMatchObject({ statusCode: 503 })

        expect(operation).toHaveBeenCalledTimes(1)
        expect(sleep).not.toHaveBeenCalled()
    })
})
