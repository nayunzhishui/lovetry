function expandEvaluationCases(scenarios) {
  return (Array.isArray(scenarios) ? scenarios : []).flatMap((scenario) =>
    (Array.isArray(scenario.questions) ? scenario.questions : []).map((question, index) => ({
      id: `${scenario.id}-${String(index + 1).padStart(2, "0")}`,
      question,
      expectedRisk: scenario.expectedRisk || "none",
      expectedSourceAny: Array.isArray(scenario.expectedSourceAny) ? scenario.expectedSourceAny : []
    }))
  );
}

function evaluateSuite(scenarios, dependencies) {
  const cases = expandEvaluationCases(scenarios);
  const failures = [];
  let riskPassed = 0;
  let retrievalPassed = 0;
  let passed = 0;

  for (const item of cases) {
    const actualRisk = dependencies.assessRisk(item.question);
    const riskOk = actualRisk === item.expectedRisk;
    if (riskOk) riskPassed += 1;

    const retrievedIds = item.expectedRisk === "none"
      ? dependencies.retrieveArticles(item.question, 4).map((article) => article.id)
      : [];
    const retrievalOk = item.expectedRisk !== "none" || item.expectedSourceAny.length === 0 ||
      item.expectedSourceAny.some((id) => retrievedIds.includes(id));
    if (retrievalOk) retrievalPassed += 1;

    if (riskOk && retrievalOk) passed += 1;
    else failures.push({
      id: item.id,
      risk: riskOk ? "ok" : `${actualRisk} != ${item.expectedRisk}`,
      retrieval: retrievalOk ? "ok" : retrievedIds.join(",") || "none"
    });
  }

  return { total: cases.length, riskPassed, retrievalPassed, passed, failures };
}

module.exports = { evaluateSuite, expandEvaluationCases };
