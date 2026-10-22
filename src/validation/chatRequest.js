const { z } = require("zod")

// Request validation: define the accepted payload shape and reject blank values.
const chatRequestSchema = z.object({
    model: z.string().trim().min(1, "Model is required"),
    messages: z.array(
        z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().refine(
                (content) => content.trim().length > 0,
                "Message content must not be empty"
            ),
        })
    ).min(1),
    temperature: z.number().min(0).max(2).optional(),
})

function validateChatRequest(payload) {
    // Request validation: safeParse returns either validated data or useful issues without throwing.
    return chatRequestSchema.safeParse(payload)
}

module.exports = { validateChatRequest }
