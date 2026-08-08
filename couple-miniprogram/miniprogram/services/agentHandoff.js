const { createHandoffRepository } = require("../shared/agent-context");
const { createScopedStorageAdapter } = require("./storageScope");

module.exports = createHandoffRepository(createScopedStorageAdapter());
