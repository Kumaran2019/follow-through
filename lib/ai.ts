import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type Msg = { role: "user" | "assistant"; content: string | ContentBlock[] };

export type ClaudeTool = { name: string; description: string; input_schema: any };

export type ClaudeResponse = { content: ContentBlock[]; stop_reason: string };

type CallArgs = { system: string; messages: Msg[]; tools?: ClaudeTool[]; max_tokens?: number; tool_choice?: any };

let sdk: AnthropicBedrock | null = null;

function region() {
  return process.env.AWS_REGION || "us-east-1";
}

function modelId() {
  const id = process.env.BEDROCK_MODEL_ID;
  if (!id) throw new Error("BEDROCK_MODEL_ID is not set.");
  return id;
}

/** Calls Claude on AWS Bedrock. Uses a Bedrock API key if present, otherwise IAM access keys. */
export async function callClaude({ system, messages, tools, max_tokens = 4096, tool_choice }: CallArgs): Promise<ClaudeResponse> {
  const apiKey = process.env.BEDROCK_API_KEY;

  if (apiKey) {
    const body: any = { anthropic_version: "bedrock-2023-05-31", max_tokens, system, messages };
    if (tools?.length) body.tools = tools;
    if (tool_choice) body.tool_choice = tool_choice;
    const url = `https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(modelId())}/invoke`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bedrock error ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as ClaudeResponse;
  }

  if (!sdk) {
    sdk = new AnthropicBedrock({
      awsRegion: region(),
      awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  }
  const res: any = await sdk.messages.create({
    model: modelId(),
    max_tokens,
    system,
    messages: messages as any,
    ...(tools?.length ? { tools: tools as any } : {}),
    ...(tool_choice ? { tool_choice } : {}),
  });
  return { content: res.content, stop_reason: res.stop_reason };
}

export function textOf(res: ClaudeResponse): string {
  return res.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}
