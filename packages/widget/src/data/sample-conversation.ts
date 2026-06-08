import type { Conversation } from "../types/conversation";

export const SAMPLE_CONVERSATION: Conversation = {
  sessionId: "sess_sample_01",
  agentName: "Eregna Guide",
  messages: [
    {
      id: "msg_01",
      role: "user",
      parts: [{ type: "text", text: "How do I create my first agent?" }],
      status: "complete",
      createdAt: Date.now() - 60_000,
    },
    {
      id: "msg_02",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Sure — let me walk you through it right here on this page.",
        },
        {
          type: "walkthrough",
          walkthroughId: "w_01",
          planGoal: "Create your first Eregna agent",
          planRationale:
            "Walk through the dashboard to show agent creation end-to-end.",
          status: "complete",
          chapters: [
            {
              title: "Welcome to the dashboard",
              description: "Orient the user to the agents dashboard.",
              elementId: "agents-page-hero",
              stepIndex: 0,
            },
            {
              title: "Your agents list",
              description: "Show where existing agents appear.",
              elementId: "agents-grid",
              stepIndex: 1,
            },
            {
              title: "Open the new-agent form",
              description: "Guide user to the create button.",
              elementId: "new-agent-btn",
              stepIndex: 2,
            },
            {
              title: "Name your agent",
              description: "Fill in the agent name field.",
              elementId: "agent-name-field",
              stepIndex: 3,
            },
            {
              title: "Set the site URL",
              description: "Enter the target website URL.",
              elementId: "agent-url-field",
              stepIndex: 4,
            },
            {
              title: "Submit and you're done",
              description: "Submit the form to create the agent.",
              elementId: "new-agent-form-section",
              stepIndex: 5,
            },
          ],
          steps: [
            {
              id: "step_01",
              status: "done",
              actions: [
                { type: "scroll-to", elementId: "agents-page-hero" },
                { type: "highlight", elementId: "agents-page-hero" },
              ],
              popover: {
                title: "Welcome to Agents",
                body: "This is your agents dashboard. Every agent you create gets its own embed key and knowledge base.",
                elementId: "agents-page-hero",
              },
            },
            {
              id: "step_02",
              status: "done",
              actions: [
                { type: "scroll-to", elementId: "agents-grid" },
                { type: "highlight", elementId: "agents-grid" },
              ],
              popover: {
                title: "Your agents",
                body: "All your agents appear here as cards. Click any card to open the agent's settings, knowledge base, and embed snippet.",
                elementId: "agents-grid",
              },
            },
            {
              id: "step_03",
              status: "done",
              actions: [
                { type: "scroll-to", elementId: "new-agent-btn" },
                { type: "highlight", elementId: "new-agent-btn" },
              ],
              popover: {
                title: "Create a new agent",
                body: "Click the '+ New agent' button to scroll down to the creation form.",
                elementId: "new-agent-btn",
              },
            },
            {
              id: "step_04",
              status: "done",
              actions: [
                { type: "scroll-to", elementId: "new-agent-form-section" },
                { type: "highlight", elementId: "agent-name-field" },
              ],
              popover: {
                title: "Name your agent",
                body: "Give your agent a name — something memorable like 'Acme Support Bot'. This label appears in the dashboard.",
                elementId: "agent-name-field",
              },
            },
            {
              id: "step_05",
              status: "done",
              actions: [{ type: "highlight", elementId: "agent-url-field" }],
              popover: {
                title: "Set the site URL",
                body: "Enter the URL of the website this agent will guide visitors on. For example: https://yourapp.com",
                elementId: "agent-url-field",
              },
            },
            {
              id: "step_06",
              status: "done",
              actions: [
                { type: "highlight", elementId: "new-agent-form-section" },
              ],
              popover: {
                title: "Hit Create",
                body: "Press 'Create agent' and you're done. Your new agent card will appear in the list above, ready for its embed key.",
                elementId: "new-agent-form-section",
              },
            },
          ],
          parentContext: null,
        },
      ],
      status: "complete",
      createdAt: Date.now() - 59_000,
    },
    {
      id: "msg_03",
      role: "user",
      parts: [{ type: "text", text: "What AI models are available?" }],
      status: "complete",
      createdAt: Date.now() - 10_000,
    },
    {
      id: "msg_04",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Currently Eregna's planning pipeline supports OpenAI (GPT-4o) and Anthropic (Claude 3.5 Sonnet) on the backend. You can switch models per-agent in the agent settings once you've created one — model selection is coming to the dashboard in the next release.",
        },
      ],
      status: "complete",
      createdAt: Date.now() - 9_000,
    },
  ],
};
