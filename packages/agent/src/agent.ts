import { AgentBuilder } from "@anvia/core";
import { getBaseAgentInstruction } from "./prompt/instruction.js";
import { garTools } from "./tools/garTools.js";
import { readyTools } from "./tools/readyTools.js";
import { observer } from "./utils/logger.js";
import { getModel } from "./providers/openai.js";
import { Studio } from "@anvia/studio";
import { webSearch } from "./tools/webSearch.js";
import { fitTools } from "./tools/fitTools.js";
import { coachPersonalTools } from "./tools/coachPersonalTools.js";
import { exportTools } from "./tools/expotTools.js";
import { vizTools } from "./tools/vizTools.js";

const agent = new AgentBuilder("running-lab", getModel())
  .name("StrideLab Coach")
  .instructions(getBaseAgentInstruction())
  .tool(webSearch)
  .tool(garTools)
  .tool(readyTools)
  .tool(fitTools)
  .tool(coachPersonalTools)
  .tool(exportTools)
  .tool(vizTools)
  .observe(observer)
  .defaultMaxTurns(8)
  .build();

new Studio([agent]).start({ port: 4021 });
