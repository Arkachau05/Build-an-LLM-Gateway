const MockLLMProvider = require("./mockProvider")

const providers = {
    mock: new MockLLMProvider(),
}

// Model prefixes select a provider; add routes here as providers are introduced.
const modelProviderRoutes = [
    { prefix: "mock-", provider: providers.mock },
]

function getProvider(model) {
    if (typeof model !== "string") {
        return null
    }

    const route = modelProviderRoutes.find(({ prefix }) =>
        model.startsWith(prefix) && model.length > prefix.length
    )

    return route ? route.provider : null
}

module.exports = { getProvider }
