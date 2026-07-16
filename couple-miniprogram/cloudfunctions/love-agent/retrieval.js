const knowledgeBase = require("./knowledge-base.json");

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function terms(value) {
  const text = normalizeText(value);
  const latin = text.match(/[a-z0-9]+/g) || [];
  const chinese = (text.match(/[\u4e00-\u9fff]+/g) || []).flatMap((chunk) => {
    const result = [chunk];
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        result.push(chunk.slice(index, index + size));
      }
    }
    return result;
  });
  return [...new Set([...latin, ...chinese])];
}

function scoreArticle(article, queryTerms) {
  const title = normalizeText(article.title);
  const keywords = (article.keywords || []).map(normalizeText);
  const content = normalizeText(`${article.category} ${article.summary} ${article.body}`);
  return queryTerms.reduce((score, term) => {
    if (keywords.some((keyword) => keyword === term)) return score + 8;
    if (keywords.some((keyword) => keyword.includes(term) || term.includes(keyword))) return score + 4;
    if (title.includes(term)) return score + 3;
    if (content.includes(term)) return score + 1;
    return score;
  }, 0);
}

function retrieveArticles(question, limit = 4) {
  const queryTerms = terms(question);
  return knowledgeBase
    .map((article) => ({ ...article, score: scoreArticle(article, queryTerms) }))
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.min(Math.max(Number(limit) || 4, 1), 6));
}

function sourcesForClient(articles) {
  return (articles || []).map((article) => ({
    id: article.id,
    title: article.title,
    category: article.category,
    excerpt: article.summary
  }));
}

function knowledgeContext(articles) {
  return (articles || []).map((article) => [
    `[${article.id}] ${article.title}（${article.category}）`,
    `要点：${article.summary}`,
    `说明：${article.body}`,
    `可执行步骤：${(article.actions || []).join("；")}`
  ].join("\n")).join("\n\n");
}

module.exports = {
  knowledgeBase,
  knowledgeContext,
  normalizeText,
  retrieveArticles,
  sourcesForClient
};
