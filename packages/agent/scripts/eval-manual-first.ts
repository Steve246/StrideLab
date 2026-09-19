import { agentEvalTarget, exactMatch, runEvalSuite } from "@anvia/core/evals";
import { manualFirstCases } from "../src/evals/manualFirstCases.js";
import { getBaseAgentInstruction } from "../src/prompt/instruction.js";
import { getModel } from "../src/providers/openai.js";
import { AgentBuilder } from "@anvia/core";
import type { PromptResponse } from "@anvia/core";

const agent = new AgentBuilder("manual-first-eval", getModel())
  .instructions(getBaseAgentInstruction())
  .defaultMaxTurns(8)
  .build();

const result = await runEvalSuite({
  name: "running-lab-manual-first-v1",
  cases: manualFirstCases,
  target: agentEvalTarget<string, PromptResponse>(agent, {
    prompt: (input) => `${input}\n\nEvaluation expectation: ${manualFirstCases.find((c) => c.input === input)?.expectation ?? ""}`,
  }),
  metrics: [
    exactMatch<string, any, boolean>({
      name: "has_output",
      actual: ({ output }) => Boolean(output.output?.trim()),
      expected: true,
    }),
  ],
  concurrency: 1,
});

console.log(JSON.stringify(result, null, 2));
