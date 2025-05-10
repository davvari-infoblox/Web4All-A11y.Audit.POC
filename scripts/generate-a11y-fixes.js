import { Octokit } from "@octokit/rest";
import { AzureOpenAI } from "openai";
import { promises as fs } from "fs";
import path from "path";

// Initialize Azure OpenAI client
const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: "gpt-4.1-mini", // your deployment name in Azure
  apiVersion: process.env.API_VERSION,
});

// Initialize GitHub client
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Utility to read JSON event
async function loadEvent() {
  return JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
}

async function main() {
  const event = await loadEvent();
  if (!event.pull_request) return;
  const { number: pull_number } = event.pull_request;
  const owner = event.repository.owner.login;
  const repo = event.repository.name;

  // Collect all audit reports
  const reportsDir = "audit-reports";
  const files = (await fs.readdir(reportsDir)).filter(
    (f) => f.endsWith(".json") && !f.includes("state")
  );
  const allComments = [];

  for (const file of files) {
    const {
      details: { violations },
      route,
    } = JSON.parse(await fs.readFile(path.join(reportsDir, file), "utf8"));
    if (!violations?.length) continue;

    // Get git diff for this route's file(s)
    const diffText = getGitDiffForRoute(route);

    // Ask LLM for patch hunks
    const diff = await generateFixes(violations, diffText);

    // Turn each hunk into a review comment suggestion
    parseDiffHunks(diff).forEach((h) => {
      allComments.push({
        path: h.file, // e.g. "src/components/Button.jsx"
        line: h.line, // the line number to attach suggestion
        body: "```suggestion\n" + h.patch + "\n```",
      });
    });
  }

  if (allComments.length) {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      event: "COMMENT",
      comments: allComments,
    });
    console.log(
      `Posted ${allComments.length} suggestions to PR #${pull_number}`
    );
  } else {
    console.log("No violations → no suggestions posted");
  }
}

// Extract git diff for relevant files (simple example)
function getGitDiffForRoute(route) {
  // You can refine this to map "route" → specific file path(s).
  // For demo, grab full diff:
  return require("child_process")
    .execSync(`git diff origin/main...HEAD`)
    .toString();
}

async function generateFixes(violations, diff) {
  const response = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content: "You generate git-style diff hunks to fix a11y violations.",
      },
      {
        role: "user",
        content: JSON.stringify({ axeReport: { violations }, diff }),
      },
    ],
    functions: [
      {
        name: "generate_patch_hunks",
        description: "Produce git-style diff hunks",
        parameters: {
          type: "object",
          properties: { diff: { type: "string" } },
          required: ["diff"],
        },
      },
    ],
    function_call: { name: "generate_patch_hunks" },
  });

  const call = response.choices[0].message.function_call;
  return call ? JSON.parse(call.arguments).diff : "";
}

// Parse a unified-diff into discrete hunks with file & line info
function parseDiffHunks(diffText) {
  const hunks = [];
  const lines = diffText.split("\n");
  let current = null;
  for (const line of lines) {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (fileMatch) {
      if (current) hunks.push(current);
      current = { file: fileMatch[2], patch: "", line: null };
      continue;
    }
    const hunkHeader = /^@@ -\d+,\d+ \+(\d+),\d+ @@/.exec(line);
    if (hunkHeader && current) {
      current.line = parseInt(hunkHeader[1], 10);
      current.patch += line + "\n";
      continue;
    }
    if (current) {
      current.patch += line + "\n";
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
