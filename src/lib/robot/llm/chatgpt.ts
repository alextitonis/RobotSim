import OpenAI from "openai";
import { IRobotLLM, IRobotLLMParams } from "../types";
import { Stream } from "openai/streaming.mjs";
import { ChatCompletionChunk } from "openai/resources/index.mjs";

type TModel = "gpt-4o" | "gpt-4o-mini";

interface IChatGPTParams extends IRobotLLMParams {
  model: TModel;
}

export class ChatGPT implements IRobotLLM {
  private model: TModel | undefined;
  private openai: OpenAI | undefined;

  initialize(params: IChatGPTParams): void {
    if (!params.apiKey) {
      throw new Error("API key is required");
    }
    this.model = params.model;
    this.openai = new OpenAI({
      apiKey: params.apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  async complete(prompt: string): Promise<string> {
    if (!this.openai || !this.model) {
      throw new Error("OpenAI or model not initialized");
    }

    const res = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }]
    });

    return res.choices[0].message.content ?? "";
  }

  async stream(prompt: string): Promise<Stream<ChatCompletionChunk>> {
    if (!this.openai || !this.model) {
      throw new Error("OpenAI or model not initialized");
    }

    const res = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      stream: true
    });

    return res;
  }
}
