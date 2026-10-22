const LLMProvider = require("./base")

class MockLLMProvider extends LLMProvider {
    constructor() {
        super("mock")
    }

    async chat({ model, messages }) {
        // This provider keeps the exercise fully runnable without an API key.
        const lastMessage = messages[messages.length - 1]

        return {
            model,
            message: {
                role: "assistant",
                content: `Mock response for: ${lastMessage.content}`,
            },
            usage: {
                promptTokens: messages.reduce(
                    (total, message) => total + message.content.length,
                    0
                ),
                completionTokens: 20,
                totalTokens: 20 + messages.reduce(
                    (total, message) => total + message.content.length,
                    0
                ),
            },
        }
    }
}

module.exports = MockLLMProvider
