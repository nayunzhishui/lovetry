const {
  ERROR_CODES,
  RECORD_TYPES,
  VISIBILITIES
} = require("./constants");
const { failure, success } = require("./result");

const RECORD_TYPE_VALUES = new Set(Object.values(RECORD_TYPES));
const VISIBILITY_VALUES = new Set(Object.values(VISIBILITIES));
const PRIVATE_BY_DEFAULT = new Set([
  RECORD_TYPES.CONFLICT,
  RECORD_TYPES.SLEEP,
  RECORD_TYPES.PERIOD,
  RECORD_TYPES.POMODORO
]);

function validateRecordInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return failure(ERROR_CODES.INVALID_RECORD, "记录内容无效");
  }

  const type = input.type;
  if (!RECORD_TYPE_VALUES.has(type)) {
    return failure(ERROR_CODES.INVALID_RECORD, "记录类型无效");
  }

  if (typeof input.title !== "string" || !input.title.trim()) {
    return failure(ERROR_CODES.INVALID_RECORD, "请填写记录标题");
  }

  if (input.content !== undefined && typeof input.content !== "string") {
    return failure(ERROR_CODES.INVALID_RECORD, "记录正文必须是文字");
  }

  const visibility =
    input.visibility ||
    (PRIVATE_BY_DEFAULT.has(type)
      ? VISIBILITIES.PRIVATE
      : VISIBILITIES.COUPLE);
  if (!VISIBILITY_VALUES.has(visibility)) {
    return failure(ERROR_CODES.INVALID_RECORD, "记录可见性无效");
  }

  const data = {
    type,
    title: input.title.trim(),
    content: (input.content || "").trim(),
    visibility
  };
  if (input.payload !== undefined) data.payload = input.payload;

  return success(data);
}

module.exports = { validateRecordInput };
