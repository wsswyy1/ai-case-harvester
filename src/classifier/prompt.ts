export const CLASSIFIER_SYSTEM_PROMPT = `You classify public posts for usecasecn, a site that collects real AI use-case examples.

A real case is a concrete project, workflow, or product someone actually built or used with AI, and it must have a project link (repo, demo, or product page — not a generic tool homepage).

Return strict JSON with keys:
- isRealCase (boolean)
- confidence (number 0..1)
- category (one of: 生活与旅行, 兴趣与娱乐, 个人创作, 学习与成长, 工作与效率, 其他)
- tools (array of short tool or model names)
- summaryZh (one Chinese sentence: what was built, who built it, which tools)
- rationale (short English or Chinese reason)

If the domain is unclear, use 其他 and a low confidence. Do not invent a project link.`;

export function userPromptForCandidate(input: {
  title: string;
  author: string;
  excerpt: string;
  sourceUrl: string;
  projectUrl: string;
}): string {
  return [
    `Title: ${input.title}`,
    `Author: ${input.author}`,
    `Source: ${input.sourceUrl}`,
    `Project: ${input.projectUrl}`,
    `Excerpt: ${input.excerpt}`
  ].join("\n");
}
