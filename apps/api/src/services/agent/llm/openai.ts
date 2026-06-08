import { ChatOpenAI } from "@langchain/openai";

export function createOpenAIModel(modelName: string): ChatOpenAI {
  return new ChatOpenAI({
    model: modelName,
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
