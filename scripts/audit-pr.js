import puppeteer from 'puppeteer';
import * as axe from 'axe-core';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Azure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/gpt-4/chat/completions?api-version=${process.env.API_VERSION}`,
});

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Read GitHub event payload
const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
const repo = event.repository.name;
const owner = event.repository.owner.login;

// Handle both push and pull request events
let isPullRequest = false;
let pull_number;
if (event.pull_request) {
  isPullRequest = true;
  pull_number = event.pull_request.number;
}

const routes = [
  '/',
  '/home',
  '/about',
  '/contact',
  '/home/overview',
  '/home/details',
  '/about/mission',
  '/about/team',
  '/contact/info',
  '/contact/form'
];

async function getChangedFiles() {
  if (isPullRequest) {
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number,
    });
    return files.map(file => file.filename);
  } else {
    const { data: commits } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: event.after,
    });
    return commits.files.map(file => file.filename);
  }
}

function getSeverityEmoji(impact) {
  switch (impact?.toLowerCase()) {
    case 'critical': return '🔴';
    case 'serious': return '🟠';
    case 'moderate': return '🟡';
    case 'minor': return '🔵';
    default: return '⚪';
  }
}

async function analyzeWithAI(violations, route) {
  const prompt = `Analyze these accessibility violations found on route ${route} and provide a clear explanation of:
1. The severity of each issue
2. How it impacts users with disabilities
3. Specific steps to fix each issue
4. Code examples where applicable

Violations: ${JSON.stringify(violations, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}

async function auditRoute(page, route) {
  console.log(`Testing route: ${route}`);
  await page.goto(`http://localhost:4200${route}`, { waitUntil: 'networkidle0' });
  
  await page.evaluate(axe.source);
  const results = await page.evaluate(() => axe.run());
  
  // Save detailed results to a JSON file
  const reportPath = `audit-reports/route${route.replace(/\//g, '-')}-${Date.now()}.json`;
  await fs.mkdir('audit-reports', { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  
  return {
    route,
    violations: results.violations,
    passes: results.passes,
    incomplete: results.incomplete,
    inapplicable: results.inapplicable,
    reportPath
  };
}

async function generateViolationDetails(violation) {
  const impact = violation.impact || 'unknown';
  const emoji = getSeverityEmoji(impact);
  
  return `
#### ${emoji} ${violation.help} (${impact})
- **Rule:** \`${violation.id}\`
- **Description:** ${violation.description}
- **Impact:** ${impact}
- **Elements Affected:** ${violation.nodes.length}
- **Suggested Fix:** ${violation.helpUrl}

<details>
<summary>Affected Elements (${violation.nodes.length})</summary>

\`\`\`html
${violation.nodes.map(node => node.html).join('\n')}
\`\`\`

${violation.nodes.map(node => `
**Element:** \`${node.target[0]}\`
**Fix:** ${node.failureSummary}
`).join('\n')}
</details>`;
}

async function createComment(analysisResults) {
  let totalViolations = 0;
  let criticalCount = 0;
  let seriousCount = 0;
  let moderateCount = 0;
  let minorCount = 0;

  const violationsByImpact = {};
  
  for (const result of analysisResults) {
    for (const violation of result.violations) {
      totalViolations++;
      const impact = violation.impact || 'unknown';
      violationsByImpact[impact] = (violationsByImpact[impact] || 0) + 1;
      
      switch(impact.toLowerCase()) {
        case 'critical': criticalCount++; break;
        case 'serious': seriousCount++; break;
        case 'moderate': moderateCount++; break;
        case 'minor': minorCount++; break;
      }
    }
  }

  const summary = `## 🔍 Accessibility Audit Report

### Summary
${totalViolations === 0 ? '✅ No accessibility violations found!' : `
⚠️ Found ${totalViolations} total violations:
- 🔴 Critical: ${criticalCount}
- 🟠 Serious: ${seriousCount}
- 🟡 Moderate: ${moderateCount}
- 🔵 Minor: ${minorCount}
`}

${analysisResults.map(result => `
### Route: ${result.route}
${result.violations.length === 0 ? '✅ No violations found' : `
Found ${result.violations.length} violation(s)

${result.violations.map(v => generateViolationDetails(v)).join('\n')}

#### AI Analysis
${result.aiAnalysis}
`}`).join('\n\n')}

### Test Coverage
- Total Routes Tested: ${analysisResults.length}
- Total Elements Checked: ${analysisResults.reduce((sum, r) => sum + r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length, 0)}
- Passing Rules: ${analysisResults.reduce((sum, r) => sum + r.passes.length, 0)}
- Violations: ${totalViolations}
- Incomplete/Review Needed: ${analysisResults.reduce((sum, r) => sum + r.incomplete.length, 0)}

### Reports
Detailed JSON reports have been saved to the \`audit-reports\` directory.

---
🤖 This analysis was performed by the A11y PR Bot using axe-core ${axe.version} and OpenAI GPT-4.
`;

  if (isPullRequest) {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: summary
    });
  } else {
    await octokit.issues.create({
      owner,
      repo,
      title: '🔍 Accessibility Audit Results',
      body: summary,
      labels: ['accessibility', 'automated-audit']
    });
  }

  // Create an artifact with the detailed reports
  console.log('Reports saved to audit-reports directory');
}

async function main() {
  try {
    console.log('Starting accessibility audit...');
    const { spawn } = await import('child_process');
    const serve = spawn('npm', ['start'], {
      stdio: 'inherit'
    });

    console.log('Waiting for Angular server to start...');
    await new Promise(resolve => setTimeout(resolve, 20000));

    const changedFiles = await getChangedFiles();
    console.log('Changed files:', changedFiles);

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-audio-output',
        '--disable-web-audio',
        '--no-first-run',
        '--no-zygote',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const results = [];
    
    for (const route of routes) {
      const routeComponents = route.split('/').filter(Boolean);
      const isRouteAffected = changedFiles.some(file => 
        routeComponents.some(component => file.includes(component))
      );

      if (isRouteAffected) {
        console.log(`Auditing route: ${route}`);
        const auditResult = await auditRoute(page, route);
        
        if (auditResult.violations.length > 0) {
          auditResult.aiAnalysis = await analyzeWithAI(auditResult.violations, route);
        }
        
        results.push(auditResult);
      }
    }

    await browser.close();
    serve.kill();

    if (results.length > 0) {
      await createComment(results);
    }

    const hasViolations = results.some(result => result.violations.length > 0);
    process.exit(hasViolations ? 1 : 0);

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main();