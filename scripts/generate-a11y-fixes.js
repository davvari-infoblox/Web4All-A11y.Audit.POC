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

  // Fetch base so we can diff
  execSync(`git fetch origin ${baseSha}`, { stdio: "ignore" });

  // Read audit reports
  const reportsDir = "audit-reports";
  const files = (await fs.readdir(reportsDir)).filter(
    (f) => f.endsWith(".json") && !f.includes("state")
  );

  for (const file of files) {
    const report = JSON.parse(
      await fs.readFile(path.join(reportsDir, file), "utf8")
    );
    const violations = report.details?.violations || [];
    if (!violations.length) continue;

    // Diff between PR base and head
    const diffText = execSync(`git diff --no-color ${baseSha} ${headSha}`, {
      encoding: "utf-8",
    });
    const patch = await generateFixes(violations, diffText);
    const hunks = parseDiffHunks(patch);

    // Post each change as a review comment suggestion
    for (const hunk of hunks) {
      for (const change of hunk.changes) {
        console.log("Hunk Change:", change);
        
        const { file: filePath, oldLine, newText } = change;
        if (!newText || !newText.trim()) continue;

        await octokit.pulls.createReviewComment({
          owner,
          repo,
          pull_number,
          commit_id: headSha,
          path: filePath,
          side: "RIGHT",
          line: oldLine,
          body: `\n\`\`\`suggestion
${newText}\n\`\`\`\n`,
        });
        console.log(`Posted suggestion for ${filePath}:${oldLine}`);
      }
    }
  }
}

async function generateFixes(violations, diff) {
  const res = await openai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      {
        role: "system",
        content:
          "Generate git-style diff hunks to fix these accessibility violations.",
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
