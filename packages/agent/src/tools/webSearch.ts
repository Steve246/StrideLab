import { createTool } from "@anvia/core";

import { Web_Search_Instruction } from "../prompt/instruction.js";

import { z } from "zod";
import { tavilyClient } from "../providers/tavily.js";

export const webSearch = createTool({
  name: "web_search",
  description: Web_Search_Instruction,
  input: z.object({
    query: z.string(),
    maxResults: z.number().min(1).max(8).optional(),
  }),
  execute: async ({ query, maxResults = 5 }) => {
    const res = await tavilyClient.search(query, {
      maxResults,
      searchDepth: "basic",
      includeAnswer: true,
    });
    return {
      answer: res.answer ?? null,
      results: res.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  },
});

// output expected

// {
//   "answer": "For ultramarathon training, weekly volume usually rises gradually; hard days are typically followed by easy/recovery days, and taper often lasts 2–3 weeks depending on race distance.",
//   "results": [
//     {
//       "title": "Ultramarathon Training Principles",
//       "url": "https://example.com/ultra-training",
//       "content": "Progress volume by ~10% per week when healthy. Long runs are the key session..."
//     },
//     {
//       "title": "Acute:Chronic Workload Ratio in Endurance Sport",
//       "url": "https://example.com/acwr",
//       "content": "Ratios above ~1.5 are often associated with higher injury risk..."
//     }
//   ]
// }
