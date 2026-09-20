#!/usr/bin/env node
import { createInterface } from "node:readline";

import { executeTool, listTools } from "../runtime/tools.mjs";

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (error) {
    sendError(null, -32700, "Parse error", String(error));
    return;
  }
  if (request.method?.startsWith("notifications/")) return;
  if (request.id === undefined || request.id === null) return;
  try {
    const result = await handle(request.method, request.params ?? {});
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    sendError(request.id, -32000, error instanceof Error ? error.message : String(error));
  }
});

async function handle(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params.protocolVersion || "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "chapterflow-skill-kit", version: "0.1.0" },
        instructions:
          "ChapterFlow is a headless web-fiction capability layer. The host model should generate prose and reasoning itself, stage formal changes as candidates, and use ChapterFlow for story state, official knowledge, review, persistence and visualization.",
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: listTools() };
    case "tools/call": {
      const name = params.name;
      if (!name) throw new Error("tools/call requires a tool name");
      try {
        const result = await executeTool(name, params.arguments ?? {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    }
    default:
      throw new Error(`Method not supported: ${method}`);
  }
}

function sendError(id, code, message, data = undefined) {
  write({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
