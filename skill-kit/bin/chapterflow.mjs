#!/usr/bin/env node
import { executeTool, listTools } from "../runtime/tools.mjs";

const [command, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }
  if (command === "tools") {
    console.log(JSON.stringify(listTools(), null, 2));
    process.exit(0);
  }
  const args = parseArgs(rest);
  let result;
  switch (command) {
    case "init":
      result = await executeTool("chapterflow_project_init", args);
      break;
    case "summary":
      result = await executeTool("chapterflow_project_summary", args);
      break;
    case "sync":
      result = await executeTool("chapterflow_project_sync", args);
      break;
    case "context":
      result = await executeTool("chapterflow_context", args);
      break;
    case "view": {
      const type = args._?.[0] ?? args.type;
      if (!type) throw new Error("view requires a type");
      result = await executeTool("chapterflow_view_render", { ...args, type });
      break;
    }
    case "review": {
      const kind = args._?.[0] ?? "opening";
      result = await executeTool(kind === "signing" ? "chapterflow_review_signing" : "chapterflow_review_opening", args);
      break;
    }
    case "knowledge":
      result = await executeTool("chapterflow_knowledge_search", args);
      break;
    case "call": {
      const toolName = args._?.[0];
      if (!toolName) throw new Error("call requires a tool name");
      const payload = args.json ? JSON.parse(String(args.json)) : { ...args };
      delete payload._;
      delete payload.json;
      result = await executeTool(toolName, payload);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`[chapterflow] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function parseArgs(tokens) {
  const result = { _: [] };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const raw = token.slice(2);
    const equal = raw.indexOf("=");
    if (equal >= 0) {
      result[raw.slice(0, equal)] = coerce(raw.slice(equal + 1));
      continue;
    }
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      result[raw] = coerce(next);
      i += 1;
    } else {
      result[raw] = true;
    }
  }
  if (result.root === undefined && result._.length && ["init", "summary", "sync", "context"].includes(command)) {
    result.root = result._[0];
  }
  return result;
}

function coerce(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  return value;
}

function printHelp() {
  console.log(`ChapterFlow Skill Kit CLI

Usage:
  chapterflow init <dir> --title "书名" [--premise "脑洞"] [--genre "都市"]
  chapterflow summary <dir>
  chapterflow sync <dir>
  chapterflow context <dir> --task write-chapter --chapterIndex 4
  chapterflow view <character_graph|timeline|promise_board|foreshadow_map|story_map|chapter_health> --root <dir>
  chapterflow review <opening|signing> --root <dir>
  chapterflow knowledge --stage opening --query 期待
  chapterflow tools
  chapterflow call <tool-name> --json '{"root":"..."}'

Set CHAPTERFLOW_PROJECT to avoid repeating --root.
`);
}
