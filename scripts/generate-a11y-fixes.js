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
    console.log(`Preparing to post fix suggestions for route ${route} to PR #${pull_number}`);
    
    // First approach: Get the actual changed files from the PR to match with our fixes
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });
    
    // Get the latest commit SHA on the PR
    const { data: pullRequest } = await octokit.pulls.get({
      owner,
      repo,
      pull_number,
    });
    
    const headSha = pullRequest.head.sha;
    
    // Instead of trying to parse the diff ourselves, we'll use a simpler approach
    // that's more compatible with GitHub's API requirements
    
    // Create a summary comment with all the fixes
    const commentBody = `## 🔧 A11y Fix Suggestions for Route: ${route}

<details>
<summary>Click to see suggested fixes</summary>

\`\`\`diff
${fixes}
\`\`\`

</details>

**Note:** The automated suggestions are provided as a diff above. Due to GitHub API limitations, these can't be applied with a single click. You can manually apply these changes to fix the accessibility issues.

_Generated by A11y Fix Bot using OpenAI_`;

    // Post the comment to the PR
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: commentBody,
    });
    
    console.log(`Posted fix suggestions as a comment to PR #${pull_number}`);
    
    // Additionally, attempt to create a proper review, but with a different approach
    // We'll create individual comments for each file in the PR that needs fixes
    try {
      // Process each changed file to extract potential fixes
      const fileComments = [];
      for (const file of files) {
        // Check if this file appears in our fixes
        if (fixes.includes(file.filename) || fixes.includes(`--- a/${file.filename}`)) {
          // This file needs fixes according to our diff
          fileComments.push({
            path: file.filename,
            position: file.changes, // GitHub API requires a position in the diff
            body: `**A11y Fix Needed**
            
This file has accessibility issues that need to be fixed. Please refer to the detailed comment with suggested changes.
            
The automated A11y audit identified violations in this file. You can find the specific changes needed in the full diff comment above.`
          });
        }
      }
      
      if (fileComments.length > 0) {
        // Create a review with comments pointing to the main suggestion comment
        await octokit.pulls.createReview({
          owner,
          repo,
          pull_number,
          commit_id: headSha,
          event: "COMMENT", 
          comments: fileComments,
          body: `A11y issues were found in ${fileComments.length} files. See the detailed comment for fix suggestions.`
        });
      }
    } catch (reviewError) {
      // If creating the review fails, we've already posted the main comment with the suggestions
      console.log("Could not create file-specific review comments:", reviewError.message);
    }
  } catch (error) {
    console.error("Error posting fixes to PR:", error);
  }
}

// Parse unified diff format into a structured format
function parseDiff(diff) {
  try {
    const files = [];
    let currentFile = null;
    let currentHunk = null;
    
    // Split the diff into lines
    const lines = diff.split('\n');
    
    for (const line of lines) {
      // Check for file header lines
      if (line.startsWith('--- a/') || line.startsWith('--- ')) {
        // Start tracking a new file
        currentFile = {
          path: line.startsWith('--- a/') 
            ? line.substring(6) 
            : line.substring(4).trim(),
          hunks: []
        };
        files.push(currentFile);
        continue;
      }
      
      // Skip +++ b/ lines (we already have the filename)
      if (line.startsWith('+++ ')) {
        continue;
      }
      
      // Check for hunk header lines (@@ -start,count +start,count @@)
      const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (hunkMatch) {
        if (!currentFile) {
          currentFile = { path: 'unknown', hunks: [] };
          files.push(currentFile);
        }
        
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
          newStart: parseInt(hunkMatch[3], 10),
          newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
          lines: []
        };
        
        currentFile.hunks.push(currentHunk);
        continue;
      }
      
      // Add diff content lines to the current hunk
      if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        currentHunk.lines.push(line);
      }
    }
    
    return files;
  } catch (error) {
    console.error("Error parsing diff:", error);
    return [];
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
