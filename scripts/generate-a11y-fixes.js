import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { AzureOpenAI } from "openai";
import { promises as fs } from "fs";
import path from "path";

// Load and parse the GitHub event payload
async function loadEvent() {
  const data = await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8");
  return JSON.parse(data);
}

// Initialize Azure OpenAI client
const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: "gpt-4.1-mini", // your deployment name in Azure
  apiVersion: process.env.API_VERSION,
});

// Initialize GitHub client
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function main() {
  const event = await loadEvent();
  if (!event.pull_request) {
    console.log("Not a pull request event, skipping");
    return;
  }

  const pull_number = event.pull_request.number;
  const owner = event.repository.owner.login;
  const repo = event.repository.name;
  const baseSha = event.pull_request.base.sha;
  const headSha = event.pull_request.head.sha;

  console.log(`PR #${pull_number} changes: ${baseSha} → ${headSha}`);

  // Read all audit report files
  const reportsDir = "audit-reports";
  const files = (await fs.readdir(reportsDir)).filter(
    (f) => f.endsWith(".json") && !f.includes("state")
  );

  const comments = [];
  for (const file of files) {
    const report = JSON.parse(
      await fs.readFile(path.join(reportsDir, file), "utf8")
    );
    const violations = report.details?.violations || [];
    const route = report.route || "";
    if (!violations.length) continue;

    // Calculate diff between the PR base and head commits
    const diffText = getGitDiffForPR(baseSha, headSha);
    const patchDiff = await generateFixes(violations, diffText);

    // Convert each hunk to a GitHub suggestion
    parseDiffHunks(patchDiff).forEach((h) => {
      comments.push({
        path: h.file,
        line: h.line,
        body: `
\`\`\`suggestion
${h.patch.trim()}
\`\`\`
`,
      });
    });
  }

  if (comments.length) {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      event: "COMMENT",
      comments,
    });
    console.log(`Posted ${comments.length} suggestions to PR #${pull_number}`);
  } else {
    console.log("No A11y violations → no suggestions posted");
  }
}

// Perform a git diff between the PR's base and head SHAs
function getGitDiffForPR(base, head) {
  // make sure the base commit exists
  execSync(`git fetch origin ${base}`, { stdio: 'inherit' });
  // now diff
  return execSync(`git diff --no-color ${base} ${head}`, { encoding: 'utf-8' });
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

function parseDiffHunks(diffText) {
  const hunks = [];
  let current = null;
  diffText.split("\n").forEach((line) => {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (fileMatch) {
      if (current) hunks.push(current);
      current = { file: fileMatch[2], patch: "", line: null };
      return;
    }
    const hunkHeader = /^@@ -\d+,\d+ \+(\d+),\d+ @@/.exec(line);
    if (hunkHeader && current) {
      current.line = parseInt(hunkHeader[1], 10);
      current.patch += line + "\n";
      return;
    }
    if (current) current.patch += line + "\n";
  });
  if (current) hunks.push(current);
  return hunks;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
