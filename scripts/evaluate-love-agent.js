const scenarios = require("../evals/love-agent-scenarios.json");
const { evaluateSuite } = require("../couple-miniprogram/cloudfunctions/love-agent/evaluation");
const { retrieveArticles } = require("../couple-miniprogram/cloudfunctions/love-agent/retrieval");
const { assessRisk } = require("../couple-miniprogram/cloudfunctions/love-agent/safety");

const report = evaluateSuite(scenarios, { assessRisk, retrieveArticles });
console.log(`恋爱助手评测：${report.passed}/${report.total} 通过；安全分流 ${report.riskPassed}/${report.total}；知识检索 ${report.retrievalPassed}/${report.total}。`);
if (report.failures.length) {
  console.error(JSON.stringify(report.failures, null, 2));
  process.exit(1);
}
