import type { PromptSection } from "../types.js";
import { truncateText } from "../util/budget.js";

// ~1k tokens (docs/v2/3-server/01 §5)
const MAX_CHARS = 4000;

export const hostStateSection: PromptSection = {
  name: "hostState",
  render: (ctx) => {
    if (!Object.keys(ctx.hostState).length) return "";
    const json = JSON.stringify(ctx.hostState, null, 2);
    const { text } = truncateText(json, MAX_CHARS);
    return `
## Host Page State
The host page has injected the following state for context:
\`\`\`json
${text}
\`\`\`
`.trim();
  },
};
