function fallbackAnswer(question, articles) {
  if (!articles || articles.length === 0) {
    return [
      "知识库里暂时没有足够贴近这个问题的内容，我不想凭空下结论。",
      "你可以补充：发生了什么、你最担心什么、你希望关系接下来有什么变化。",
      "在信息更清楚前，先避免替对方猜动机，也不要在情绪很强时做不可逆决定。"
    ].join("\n\n");
  }
  const primary = articles[0];
  const actions = (primary.actions || []).slice(0, 3).map((action, index) => `${index + 1}. ${action}`).join("\n");
  const secondary = articles[1] ? `\n\n另一个可参考的角度是：${articles[1].summary} [${articles[1].id}]` : "";
  return [
    `先给你一个基于知识库的起点：${primary.summary} [${primary.id}]`,
    actions,
    `你可以先从最容易做到的一步开始，不必一次解决全部问题。${secondary}`,
    `为了让建议更贴近你：在“${String(question || "").slice(0, 24)}”这件事里，你最想改变的是哪一个具体场景？`
  ].join("\n\n");
}

module.exports = { fallbackAnswer };
