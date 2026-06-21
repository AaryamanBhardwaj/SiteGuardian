# SiteGuardian

> **Source-Available — All Rights Reserved**
> This code is viewable for educational and reference purposes only. Copying, redistribution, and derivative works are prohibited without written permission. See [LICENSE](LICENSE).

A full-stack website health monitoring platform that automatically tracks performance, accessibility, and visual regressions over time with AI-powered explanations when things break.

## Features

- **Instant Free Scan** — paste any URL on the landing page, get Lighthouse performance + axe-core accessibility results in seconds (no signup required)
- **Project Monitoring** — register websites, schedule daily/weekly automated audits
- **Regression Detection** — pure numeric threshold comparison detects score drops instantly (zero AI in the detection loop)
- **AI Explanations** — when a regression is detected, Gemini Flash-Lite generates a plain-English explanation of likely causes and a suggested fix
- **Visual Diffing** — pixelmatch compares screenshots between scans to catch layout/visual regressions
- **Email Alerts** — SES sends regression alerts to your configured email
- **Explanation Caching** — identical regressions reuse cached explanations (SHA-256 signature hash, 30-day TTL)
- **Rate Limiting** — global daily cap on AI calls (default 50/day) with atomic DynamoDB counter

## Architecture

- **Frontend**: Next.js (App Router) + Tailwind CSS → S3 + CloudFront
- **Auth**: AWS Cognito (amazon-cognito-identity-js)
- **API**: Lambda Function URL (Node.js 20)
- **Scan Engine**: Lambda container image (Playwright + Lighthouse + axe-core)
- **Scheduler**: EventBridge Scheduler → Lambda
- **Storage**: DynamoDB (on-demand), S3 (screenshots/diffs)
- **AI**: Gemini Flash-Lite (only on regression, cached + rate-limited)
- **Alerts**: SES email on regression
- **IaC**: Terraform

## Local Development

### Prerequisites

- Node.js 20+ (`node --version`)
- AWS CLI configured (`aws sts get-caller-identity`)
- Google Chrome installed

### Setup

```bash
npm install

# Install Lambda dependencies
cd lambda/scan-engine && npm install && cd ../..
cd lambda/api && npm install && cd ../..
cd lambda/scheduler && npm install && cd ../..
```

### Run Dev Servers

```bash
# Terminal 1: Scan engine (port 4000)
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node lambda/scan-engine/dev-server.mjs

# Terminal 2: API (port 4001)
AWS_REGION=us-east-1 node lambda/api/dev-server.mjs

# Terminal 3: Frontend (port 3001)
npx next dev -p 3001
```

### Environment Variables

Copy `.env.local` and fill in your Cognito values:

```
NEXT_PUBLIC_SCAN_API_URL=http://localhost:4000/scan
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<your-pool-id>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<your-client-id>
```

## Infrastructure (Terraform)

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Required Manual Steps

1. **Gemini API key** — store in SSM Parameter Store:
   ```bash
   aws ssm put-parameter --name "/siteguardian/gemini-api-key" \
     --type SecureString --value "YOUR_KEY" --region us-east-1
   ```

2. **SES email verification** — click the verification link sent to your alert email

3. **Scan engine Docker image** — build and push to ECR:
   ```bash
   aws ecr create-repository --repository-name siteguardian-scan-engine
   docker build -t siteguardian-scan-engine lambda/scan-engine/
   docker tag siteguardian-scan-engine:latest \
     <account-id>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest
   ```

### Destroy

```bash
cd terraform
terraform destroy
```

All resources use on-demand/pay-per-request billing and are designed for AWS free-tier constraints.

## Seed Demo Data

```bash
cd lambda/scheduler
AWS_REGION=us-east-1 node ../../scripts/seed-demo-data.mjs
```

Creates a demo project with 7 days of scan history including an intentional regression on day 4.

## DynamoDB Tables

| Table | Partition Key | Sort Key |
|-------|--------------|----------|
| SiteGuardian-Projects | projectId | — |
| SiteGuardian-ScanResults | projectId | scanTimestamp |
| SiteGuardian-RegressionEvents | projectId | eventTimestamp |
| SiteGuardian-ExplanationCache | signatureHash | — |
| SiteGuardian-RateLimitCounters | dateKey | — |

## Regression Detection

Pure numeric comparison — zero AI:

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Performance Score | 5 points | decrease |
| Accessibility Score | 5 points | decrease |
| LCP | 0.5s | increase |
| CLS | 0.05 | increase |
| INP | 50ms | increase |
| Violation Count | 2 | increase |

AI (Gemini Flash-Lite) is called only when a regression is detected. Explanations are cached by signature hash and subject to a global daily rate limit (default: 50/day).

## License

Copyright (c) 2026 Aaryaman Bhardwaj. All Rights Reserved.

This project is source-available for viewing and educational purposes only. See [LICENSE](LICENSE) for full terms.
