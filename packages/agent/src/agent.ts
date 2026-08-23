import { AgentBuilder } from "@anvia/core";
import { BASE_AGENT_INSTRUCTION } from "./prompt/instruction.js";
import { garTools } from "./tools/garTools.js";
import { readyTools } from "./tools/readyTools.js";
import { observer } from "./utils/logger.js";
import { getModel } from "./providers/openai.js";
import { Studio } from "@anvia/studio";
import { webSearch } from "./tools/webSearch.js";

const agent = new AgentBuilder("running-lab", getModel())
  .name("Steven Running Labs")
  .instructions(BASE_AGENT_INSTRUCTION)
  .tool(webSearch)
  .tool(garTools)
  .tool(readyTools)
  .observe(observer)
  .defaultMaxTurns(8)
  .build();

new Studio([agent]).start({ port: 4021 });
