const crypto = require("node:crypto")

function requestId() {
    return `req_${crypto.randomUUID()}`
}

module.exports = { requestId }
