const request = require("supertest")
const { createApp } = require("../src/app")
import { describe, expect, it } from "vitest"

describe("health", () => {
    it("returns ok", async () => {
        const response = await request(createApp()).get("/health")

        expect(response.status).toBe(200)
        expect(response.body.status).toBe("ok")
    })
})
