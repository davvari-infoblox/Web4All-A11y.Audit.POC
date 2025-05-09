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

// WCAG Level mapping
const wcagLevelMap = {
  'wcag2a': 'WCAG 2.0 Level A',
  'wcag2aa': 'WCAG 2.0 Level AA',
  'wcag2aaa': 'WCAG 2.0 Level AAA',
  'wcag21a': 'WCAG 2.1 Level A',
  'wcag21aa': 'WCAG 2.1 Level AA',
  'wcag21aaa': 'WCAG 2.1 Level AAA',
  'wcag22aa': 'WCAG 2.2 Level AA',
  'best-practice': 'Best Practice'
};

// Configure axe options for AAA level testing
const axeConfig = {
  runOnly: {
    type: 'tag',
    values: ['wcag2aaa', 'wcag21aaa', 'wcag22aa', 'best-practice']
  },
  reporter: 'v2',
  resultTypes: ['violations', 'incomplete', 'passes'],
  rules: {
    'color-contrast': { enabled: true },
    'link-in-text-block': { enabled: true },
    'autocomplete-valid': { enabled: true },
    'video-description': { enabled: true },
    'audio-description': { enabled: true }
  }
};

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

function getSeverityBadge(impact) {
  switch (impact?.toLowerCase()) {
    case 'critical': return '🔴 Critical';
    case 'serious': return '🟠 Serious';
    case 'moderate': return '🟡 Moderate';
    case 'minor': return '🔵 Minor';
    default: return '⚪ Unknown';
  }
}

function getWCAGLevel(tags) {
  const wcagTags = tags.filter(tag => tag.startsWith('wcag2'));
  if (wcagTags.length === 0) return 'best-practice';
  return wcagTags.reduce((highest, current) => {
    if (current.includes('aaa')) return 'AAA';
    if (current.includes('aa') && highest !== 'AAA') return 'AA';
    if (current.includes('a') && !current.includes('aa') && highest !== 'AAA' && highest !== 'AA') return 'A';
    return highest;
  }, 'A');
}

async function analyzeWithAI(violations, route) {
  const prompt = `Analyze these accessibility violations found on route ${route} and provide a clear explanation of:
1. The severity of each issue (Critical, Serious, Moderate, Minor)
2. The WCAG Success Criterion that was violated
3. How it impacts users with different disabilities
4. Step-by-step remediation steps with code examples
5. Additional best practices to consider

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
  
  // Inject and run axe-core with AAA level configuration
  await page.evaluate(axe.source);
  const results = await page.evaluate((config) => axe.run(document, config), axeConfig);
  
  console.log(`Results for route ${route}:`, {
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length
  });

  // Create a more detailed report object
  const detailedReport = {
    status: 'completed',
    timestamp: new Date().toISOString(),
    route,
    summary: {
      violations: results.violations.length,
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length
    },
    details: {
      violations: results.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map(node => ({
          html: node.html,
          target: node.target,
          failureSummary: node.failureSummary
        }))
      })),
      passes: results.passes,
      incomplete: results.incomplete
    }
  };
  
  // Save detailed results to JSON file
  const reportPath = `audit-reports/route${route.replace(/\//g, '-')}-${Date.now()}.json`;
  await fs.mkdir('audit-reports', { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`Saved detailed report to ${reportPath}`);
  
  return {
    route,
    violations: results.violations,
    passes: results.passes,
    incomplete: results.incomplete,
    inapplicable: results.inapplicable,
    reportPath,
    timestamp: new Date().toISOString()
  };
}

async function generateViolationDetails(violation) {
  const impact = violation.impact || 'unknown';
  const wcagLevel = getWCAGLevel(violation.tags);
  const badge = getSeverityBadge(impact);
  
  return `
### ${badge} - ${violation.help}
- **Rule:** \`${violation.id}\`
- **WCAG Level:** ${wcagLevel}
- **Impact:** ${impact}
- **Description:** ${violation.description}
- **WCAG Success Criteria:** ${violation.tags.filter(tag => tag.startsWith('wcag')).map(tag => wcagLevelMap[tag] || tag).join(', ')}

<details>
<summary>Affected Elements (${violation.nodes.length})</summary>

\`\`\`html
${violation.nodes.map(node => node.html).join('\n')}
\`\`\`

${violation.nodes.map(node => `
#### Element ${node.target.join(' ')}
- **HTML:** \`${node.html}\`
- **Fix Summary:** ${node.failureSummary}
- **Impact:** ${node.impact || 'Unknown'}
${node.any.length ? `- **Must Pass:** ${node.any.map(check => '  - ' + check.message).join('\n')}` : ''}
${node.all.length ? `- **Required Fixes:** ${node.all.map(check => '  - ' + check.message).join('\n')}` : ''}
`).join('\n')}

**Help:** ${violation.helpUrl}
</details>`;
}

async function createComment(analysisResults) {
  let totalViolations = 0;
  const violationsByLevel = {
    critical: { count: 0, items: [] },
    serious: { count: 0, items: [] },
    moderate: { count: 0, items: [] },
    minor: { count: 0, items: [] }
  };
  
  for (const result of analysisResults) {
    for (const violation of result.violations) {
      totalViolations++;
      const level = violation.impact || 'minor';
      violationsByLevel[level].count++;
      violationsByLevel[level].items.push({
        ...violation,
        route: result.route
      });
    }
  }

  const summary = `# 🔍 Accessibility Audit Report (AAA Level)

## Executive Summary
${totalViolations === 0 ? '✅ No accessibility violations found!' : `
⚠️ Found ${totalViolations} total violations:
- 🔴 Critical: ${violationsByLevel.critical.count}
- 🟠 Serious: ${violationsByLevel.serious.count}
- 🟡 Moderate: ${violationsByLevel.moderate.count}
- 🔵 Minor: ${violationsByLevel.minor.count}
`}

## Detailed Analysis by Severity

${Object.entries(violationsByLevel).map(([level, data]) => data.items.length ? `
### ${getSeverityBadge(level)} Issues (${data.count})
${data.items.map(violation => `
#### On Route: ${violation.route}
${generateViolationDetails(violation)}

##### AI Analysis
${violation.aiAnalysis}
`).join('\n')}
` : '').join('\n')}

## Test Coverage Summary
- Total Routes Tested: ${analysisResults.length}
- Total Elements Checked: ${analysisResults.reduce((sum, r) => sum + r.passes.length + r.violations.length + r.incomplete.length + r.inapplicable.length, 0)}
- Passing Rules: ${analysisResults.reduce((sum, r) => sum + r.passes.length, 0)}
- Total Violations: ${totalViolations}
- Needs Review: ${analysisResults.reduce((sum, r) => sum + r.incomplete.length, 0)}

## Testing Configuration
- WCAG Level: AAA
- Standards: WCAG 2.0, 2.1, 2.2
- Best Practices: Included
- Tool Version: axe-core ${axe.version}

## Reports
Detailed JSON reports have been saved in the \`audit-reports\` directory.

---
🤖 This analysis was performed by the A11y PR Bot using axe-core ${axe.version} and Azure OpenAI GPT-4.
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
      title: '🔍 Accessibility Audit Results (AAA Level)',
      body: summary,
      labels: ['accessibility', 'automated-audit', 'wcag-aaa']
    });
  }

  console.log('Reports saved to audit-reports directory');
}

async function main() {
  try {
    console.log('Starting AAA level accessibility audit...');
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
        
        // Get AI analysis for each violation individually for more detailed insights
        if (auditResult.violations.length > 0) {
          for (const violation of auditResult.violations) {
            violation.aiAnalysis = await analyzeWithAI([violation], route);
          }
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