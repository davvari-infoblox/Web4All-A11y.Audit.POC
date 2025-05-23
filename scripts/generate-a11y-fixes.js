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
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function main() {
  try {
    console.log("Starting accessibility fix generation process...");
    console.log(`Using OpenAI API Key: ${process.env.AZURE_OPENAI_API_KEY}`);
    console.log(`Using OpenAI Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
    console.log(`Using OpenAI API Version: ${process.env.API_VERSION}`);
    console.log(`Using GitHub Token: ${process.env.GITHUB_TOKEN}`);
    console.log(`Using GitHub Event Path: ${process.env.GITHUB_EVENT_PATH}`);

    // Read GitHub event payload
    const event = JSON.parse(
      await fs.readFile(process.env.GITHUB_EVENT_PATH, "utf8")
    );
    const repo = event.repository.name;
    const owner = event.repository.owner.login;

    // Handle pull request events
    if (!event.pull_request) {
      console.log("Not a pull request event, skipping fix generation");
      return;
    }

    const pull_number = event.pull_request.number;
    console.log(`Processing PR #${pull_number} for ${owner}/${repo}`);

    // Read the audit reports directory
    const reportsDir = "audit-reports";
    const reportFiles = await fs.readdir(reportsDir);
    const jsonReports = reportFiles.filter(
      (file) => file.endsWith(".json") && !file.includes("state")
    );

    console.log(`Found ${jsonReports.length} audit report files`);

    // Process each report and generate fixes
    for (const reportFile of jsonReports) {
      console.log(`Processing report: ${reportFile}`);
      const reportPath = path.join(reportsDir, reportFile);
      const reportContent = await fs.readFile(reportPath, "utf8");
      const report = JSON.parse(reportContent);

      // Skip if no violations
      if (
        !report.details?.violations ||
        report.details.violations.length === 0
      ) {
        console.log(`No violations found in ${reportFile}, skipping`);
        continue;
      }

      // Process the violations and generate fixes with OpenAI
      const violations = report.details.violations;
      console.log(
        `Found ${violations.length} violations to fix in ${reportFile}`
      );

      // Generate fixes using OpenAI
      const fixes = await generateFixes(violations, report.route);

      // Post the fixes as suggestions on the PR
      if (fixes && fixes.length > 0) {
        await postFixesToPR(fixes, owner, repo, pull_number, report.route);
      }
    }

    console.log("Accessibility fix generation completed");
  } catch (error) {
    console.error("Fix generation failed:", error);
    process.exit(1);
  }
}

async function generateFixes(violations, route) {
  console.log(
    `Generating fixes for ${violations.length} violations on route ${route}`
  );

  try {
    // Create the axeReport object with the violations
    const axeReport = {
      route,
      violations,
    };

    // Call OpenAI to generate fixes
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You generate git-style diff hunks to fix a11y violations.",
        },
        {
          role: "user",
          content: JSON.stringify({
            file: "multiple changed components",
            axeReport,
            fixInstructions:
              "Generate unified-diff patch hunks to fix each violation.",
          }),
        },
      ],
      functions: [
        {
          name: "generate_patch_hunks",
          description: "Produce git-style diff hunks",
          parameters: {
            type: "object",
            properties: {
              diff: { type: "string" },
            },
            required: ["diff"],
          },
        },
      ],
      function_call: { name: "generate_patch_hunks" },
    });

    // Extract the patch hunks from the response
    const functionCall = response.choices[0].message.function_call;
    if (functionCall && functionCall.name === "generate_patch_hunks") {
      const functionArgs = JSON.parse(functionCall.arguments);
      return functionArgs.diff;
    }

    console.log("No function call found in the response");
    return null;
  } catch (error) {
    console.error("Error generating fixes with OpenAI:", error);
    return null;
  }
}

async function postFixesToPR(fixes, owner, repo, pull_number, route) {
  try {
    // Format the fixes as a PR comment with collapsible sections
    const commentBody = `## 🔧 A11y Fix Suggestions for Route: ${route}

<details>
<summary>Click to see suggested fixes</summary>

\`\`\`diff
${fixes}
\`\`\`

</details>

These fixes address accessibility violations found during the audit. You can apply these changes manually or use the suggestions.

_Generated by A11y Fix Bot using OpenAI_`;

    // Post the comment to the PR
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: commentBody,
    });

    console.log(`Posted fix suggestions to PR #${pull_number}`);
  } catch (error) {
    console.error("Error posting fixes to PR:", error);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
