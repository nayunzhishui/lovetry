// 与其他云函数目录内同名文件保持一致（records/plans 各持有一份拷贝）。
// 云函数之间不能互相 require（各自独立打包部署），修改本文件时请同步更新所有拷贝。
//
// 限制自由结构字段（payload/metrics）的 JSON 体积：这两个字段不做结构校验，
// 不设上限时恶意或异常客户端可以让单文档无限膨胀，触发数据库单文档上限并拖慢列表/同步查询。
const MAX_FLEXIBLE_FIELD_JSON_LENGTH = 16384;

function exceedsFlexibleFieldLimit(value, maxLength = MAX_FLEXIBLE_FIELD_JSON_LENGTH) {
  if (value === undefined || value === null) return false;
  try {
    return JSON.stringify(value).length > maxLength;
  } catch (error) {
    // 循环引用等无法序列化的输入一律视为超限，由调用方转成各自的业务错误码。
    return true;
  }
}

module.exports = { MAX_FLEXIBLE_FIELD_JSON_LENGTH, exceedsFlexibleFieldLimit };
