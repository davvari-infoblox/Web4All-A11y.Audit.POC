import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { AzureOpenAI } from "openai";
import { promises as fs } from "fs";
import path from "path";

// Initialize clients
const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: "gpt-4.1-mini", // your deployment name in Azure
  apiVersion: process.env.API_VERSION,
});
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function main() {
  const event = JSON.parse(
    await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8")
  );
  if (!event.pull_request) return;

  const pull_number = event.pull_request.number;
  const owner = event.repository.owner.login;
  const repo = event.repository.name;
  const baseSha = event.pull_request.base.sha;
  const headSha = event.pull_request.head.sha;

  // Fetch base commit so diff works
  execSync(`git fetch origin ${baseSha}`, { stdio: "ignore" });

  // Read reports
  const reportsDir = "audit-reports";
  const reportFiles = (await fs.readdir(reportsDir)).filter(
    (f) => f.endsWith(".json") && !f.includes("state")
  );

  const suggestions = [];
  const seen = new Set();

  for (const file of reportFiles) {
    const report = JSON.parse(
      await fs.readFile(path.join(reportsDir, file), "utf8")
    );
    const violations = report.details?.violations || [];
    if (!violations.length) continue;

    // Get diff between base and head
    const diffText = execSync(`git diff --no-color ${baseSha} ${headSha}`, {
      encoding: "utf-8",
    });
    // Generate patch hunks from LLM
    const patch = await generateFixes(violations, diffText);

    // Parse hunks into individual line changes
    const hunks = parseDiffHunks(patch);
    for (const hunk of hunks) {
      for (const change of hunk.changes) {
        const { file: filePath, oldLine, newText } = change;
        if (newText == null || newText.trim() === "") continue; // skip empty or null

        const key = `${filePath}:${oldLine}:${newText}`;
        if (seen.has(key)) continue; // dedupe
        seen.add(key);

        suggestions.push({
          path: filePath,
          line: oldLine,
          body: `
\`\`\`suggestion
${newText}
\`\`\`
`,
        });
      }
    }
  }

  if (suggestions.length) {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number,
      event: "COMMENT",
      comments: suggestions,
    });
    console.log(
      `Posted ${suggestions.length} suggestions to PR #${pull_number}`
    );
  } else {
    console.log("No accessibility suggestions generated.");
  }
}

async function generateFixes(violations, diff) {
  const res = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content: "Generate git-style diff hunks to fix these a11y violations.",
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
  const call = res.choices[0].message.function_call;
  return call ? JSON.parse(call.arguments).diff : "";
}

function parseDiffHunks(diffText) {
  const hunks = [];
  let current = null;
  diffText.split("\n").forEach((line) => {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (fileMatch) {
      if (current) hunks.push(current);
      current = {
        file: fileMatch[2],
        changes: [],
        oldLine: null,
        newLine: null,
      };
      return;
    }
    const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(line);
    if (header && current) {
      current.oldLine = parseInt(header[1], 10);
      current.newLine = parseInt(header[3], 10);
      return;
    }
    if (!current) return;
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.changes.push({
        file: current.file,
        oldLine: current.oldLine,
        newText: null,
      });
      current.oldLine++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      const last = current.changes[current.changes.length - 1];
      if (last && last.newText === null) last.newText = line.slice(1);
      current.newLine++;
    } else {
      current.oldLine++;
      current.newLine++;
    }
  });
  if (current) hunks.push(current);
  return hunks;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
