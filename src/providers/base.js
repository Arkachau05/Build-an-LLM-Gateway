class LLMProvider {
    constructor(name) {
        this.name = name
    }

    // Providers implement this shared interface so the service stays provider-agnostic.
    async chat() {
        throw new Error("Provider chat() is not implemented")
    }
}

module.exports = LLMProvider
