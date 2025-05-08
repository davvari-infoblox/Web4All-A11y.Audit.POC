const puppeteer = require('puppeteer');
const axe = require('axe-core');
const { Octokit } = require('@octokit/rest');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');
const fs = require('fs').promises;

// Initialize OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Read GitHub event payload
const event = require(process.env.GITHUB_EVENT_PATH);
const repo = event.repository.name;
const owner = event.repository.owner.login;
const pull_number = event.pull_request.number;

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
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number,
  });
  return files.map(file => file.filename);
}

async function analyzeWithAI(violations, route) {
  const prompt = `Analyze these accessibility violations found on route ${route} and provide a clear explanation of:
1. The severity of each issue
2. How it impacts users with disabilities
3. Specific steps to fix each issue
4. Code examples where applicable

Violations: ${JSON.stringify(violations, null, 2)}`;

  const response = await openai.createChatCompletion({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return response.data.choices[0].message.content;
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

async function createPRComment(analysisResults) {
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

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body: comment
  });
}

async function main() {
  try {
    // Start the Angular dev server
    const serve = require('child_process').spawn('npm', ['start'], {
      stdio: 'inherit'
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 20000));

    const changedFiles = await getChangedFiles();
    const browser = await puppeteer.launch();
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
      await createPRComment(results);
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