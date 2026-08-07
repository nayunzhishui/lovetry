const { createDraftRepository } = require("../shared/form-assist");
const { createScopedStorageAdapter } = require("./storageScope");

module.exports = createDraftRepository(createScopedStorageAdapter());
