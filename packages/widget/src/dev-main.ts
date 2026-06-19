import { initWidget } from "./index.js";

initWidget({
  debug: true,
  state: { user: "dev-user", cartCount: 0 },
  knowledge: [
    { title: "Returns", content: "30-day return window on all items." },
    { title: "Shipping", content: "Free shipping on orders over $50." },
  ],
  tools: [
    {
      name: "testTool",
      description: "Log a message to the browser console for demo purposes.",
      runsIn: "client",
      parameters: {
        type: "object",
        properties: {
          msg: {
            type: "string",
            description: "The message to print to the console.",
          },
        },
        required: ["msg"],
        additionalProperties: false,
      },
      display: { icon: "🧪", label: "Test tool" },
      handler: ({ msg }) => {
        console.log("[eregna testTool]", msg);
        return { logged: msg };
      },
    },
  ],
});
