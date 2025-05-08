import puppeteer from 'puppeteer';
import * as axe from 'axe-core';
import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// TODO: Try different openai models
// Initialize OpenAI with Azure configuration
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4'}/chat/completions?api-version=${process.env.API_VERSION || '2025-01-01-preview'}`,
  defaultQuery: { 'api-version': process.env.API_VERSION || '2025-01-01-preview' },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
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

// Angular routes to test
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
    // For push events, get the changed files from the commits
    const { data: commits } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: event.after, // SHA of the latest commit
    });
    return commits.files.map(file => file.filename);
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
  await page.goto(`http://localhost:4200${route}`, { waitUntil: 'networkidle0' });
  
  // Inject and run axe-core
  await page.evaluate(axe.source);
  const results = await page.evaluate(() => axe.run());
  
  return {
    route,
    violations: results.violations,
    passes: results.passes.length,
    inapplicable: results.inapplicable.length
  };
}

async function createComment(analysisResults) {
  const comment = `## 🔍 Accessibility Audit Results

${analysisResults.map(result => `
### Route: ${result.route}
${result.violations.length === 0 ? '✅ No accessibility violations found!' : `
⚠️ Found ${result.violations.length} accessibility violation(s)

${result.aiAnalysis}
`}`).join('\n\n')}

---
🤖 This analysis was performed by the A11y PR Bot using axe-core and OpenAI.
`;

  if (isPullRequest) {
    // Comment on the PR
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: comment
    });
  } else {
    // Create an issue for push events
    await octokit.issues.create({
      owner,
      repo,
      title: '🔍 Accessibility Audit Results',
      body: comment,
      labels: ['accessibility', 'automated-audit']
    });
  }
}

async function main() {
  try {
    // Start the Angular dev server
    const { spawn } = await import('child_process');
    const serve = spawn('npm', ['start'], {
      stdio: 'inherit'
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 20000));

    const changedFiles = await getChangedFiles();
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
    
    // Enable console logging from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const results = [];
    
    for (const route of routes) {
      // Check if any files affecting this route have changed
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
    serve.kill(); // Stop the dev server

    if (results.length > 0) {
      await createComment(results);
    }

    // Exit with error if any violations were found
    const hasViolations = results.some(result => result.violations.length > 0);
    process.exit(hasViolations ? 1 : 0);

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main();