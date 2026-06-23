# SiteGuardian

> **Source-Available — All Rights Reserved**
> This code is viewable for educational and reference purposes only. Copying, redistribution, and derivative works are prohibited without written permission. See [LICENSE](LICENSE).

A full-stack website health monitoring platform that automatically tracks performance, accessibility, and visual regressions over time with AI-powered explanations when things break.

**Live:** [https://d1fkdc03w6csjm.cloudfront.net](https://d1fkdc03w6csjm.cloudfront.net)

## Features

- **Instant Free Scan** — paste any URL on the landing page, get Lighthouse performance + axe-core accessibility results in seconds (no signup required)
- **Project Monitoring** — register websites, schedule daily/weekly automated audits
- **Regression Detection** — pure numeric threshold comparison detects score drops instantly (zero AI in the detection loop)
- **AI Explanations** — when a regression is detected, Gemini 2.5 Flash generates a plain-English explanation of likely causes and a suggested fix
- **Visual Diffing** — pixelmatch compares screenshots between scans to catch layout/visual regressions
- **Email Alerts** — SES sends regression alerts to your configured email
- **Explanation Caching** — identical regressions reuse cached explanations (SHA-256 signature hash, 30-day TTL)
- **Rate Limiting** — global daily cap on AI calls (default 50/day) with atomic DynamoDB counter

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 16 (App Router) | Static pages with client-side routing |
| **Frontend Hosting** | AWS S3 + CloudFront | Zero-cost static hosting with global CDN |
| **Backend API** | AWS Lambda (Node.js 20) | Pay-per-request, zero idle cost |
| **API Routing** | AWS API Gateway HTTP API | Routes HTTP requests to Lambda, handles CORS |
| **Scan Engine** | AWS Lambda (Container image) | Runs headless Chrome + Lighthouse + axe-core; container needed because Chromium exceeds 50MB zip limit |
| **Database** | Amazon DynamoDB (on-demand) | Zero idle cost, pay only for reads/writes |
| **Authentication** | Amazon Cognito | 50K free MAUs, JWT-based, no third-party dependency |
| **Object Storage** | Amazon S3 | Screenshots and visual diffs |
| **AI Explanations** | Google Gemini 2.5 Flash | Fast, capable, free tier available |
| **Secrets** | AWS SSM Parameter Store | Free, encrypted storage for API keys |
| **Email Alerts** | Amazon SES | Sends regression alert emails |
| **Scheduling** | Amazon EventBridge | Triggers automated scans on schedule |
| **IaC** | Terraform (modular) | Reproducible infrastructure in 6 modules |

## Architecture

```
  User Browser ──────> CloudFront CDN ──────> S3 Bucket
  (static HTML/JS)         │                 (Next.js static pages)
                           │
             API calls (fetch from browser)
                           │
                           v
              ┌─────────────────────────────────────┐
              │   API Gateway HTTP API              │
              │   (CORS, routing)                   │
              └────────────────┬────────────────────┘
                               │
                               v
              ┌─────────────────────────────────────┐
              │   API Lambda (Node.js 20)           │
              │                                     │
              │   POST /scan      Start async scan  │──> Scan Engine Lambda
              │   GET  /scan/:id  Poll results      │    (async invocation)
              │   /projects       CRUD operations   │
              │   /scans          Scan history      │
              │   /regressions    Regression events │
              │   /scan-now       Store results +   │
              │                   detect regressions│
              └──┬──────┬──────┬──────┬─────────────┘
                 │      │      │      │
    ┌────────────┘      │      │      └────────────┐
    v                   v      v                   v
┌──────────┐     ┌────────┐  ┌─────┐        ┌──────────┐
│ DynamoDB │     │   S3   │  │ SSM │        │   SES    │
│ 6 tables │     │ images │  │ key │        │  email   │
└──────────┘     └────────┘  └─────┘        └──────────┘
                                │
                                v
                         ┌──────────────┐
                         │ Gemini 2.5   │
                         │ Flash API    │
                         └──────────────┘
```

### Async Scan Pattern

API Gateway has a hard 30-second timeout. Some websites take 30+ seconds to scan. To handle this:

1. Frontend POSTs to `/scan` — API Lambda creates a pending record in DynamoDB and invokes Scan Engine Lambda asynchronously
2. Scan Engine runs Lighthouse + axe-core, writes results back to DynamoDB when done
3. Frontend polls `GET /scan/{scanId}` every 3 seconds until status is "complete"
4. No timeout issues — the scan can run for up to 120 seconds

### Why API Gateway instead of Lambda Function URLs

Lambda Function URLs with `AuthType: NONE` are blocked at the account level (organization policy). API Gateway HTTP API provides the same routing capability with built-in CORS support.

## AWS Services Breakdown

### Lambda Functions (3)

| Function | Runtime | Memory | Timeout | Role |
|----------|---------|--------|---------|------|
| `siteguardian-api` | Node.js 20 (zip) | 256 MB | 120s | REST API — all authenticated routes |
| `siteguardian-scan-engine` | Container image | 2048 MB | 120s | Headless Chrome + Lighthouse + axe-core + screenshot capture |
| `siteguardian-scheduler` | Node.js 20 (zip) | 512 MB | 120s | Automated scans triggered by EventBridge |

### DynamoDB Tables (6)

All tables use on-demand (PAY_PER_REQUEST) billing — zero cost at rest.

| Table | Keys | Purpose |
|-------|------|---------|
| `SiteGuardian-Projects` | PK: `projectId`, GSI: `userId` | Registered websites with URL, scan frequency, alert email |
| `SiteGuardian-ScanResults` | PK: `projectId`, SK: `scanTimestamp` | Every scan result — scores, Core Web Vitals, screenshot keys |
| `SiteGuardian-RegressionEvents` | PK: `projectId`, SK: `eventTimestamp#metric` | Detected regressions with before/after values and AI explanations |
| `SiteGuardian-ExplanationCache` | PK: `signatureHash` | Cached AI explanations (30-day TTL) |
| `SiteGuardian-RateLimitCounters` | PK: `dateKey` | Daily Gemini API call counter (2-day TTL) |
| `SiteGuardian-InstantScans` | PK: `scanId` | Async scan jobs with TTL (1-hour expiry) |

### Other Services

| Service | Resource | Purpose |
|---------|----------|---------|
| **S3** | `siteguardian-frontend-static` | Static frontend assets (HTML, JS, CSS) |
| **CloudFront** | Distribution `EBRFAN8RNXDB3` | Global CDN with SPA fallback for client-side routing |
| **API Gateway** | HTTP API | Routes API requests to Lambda, handles CORS |
| **ECR** | `siteguardian-scan-engine` | Scan engine Docker image repository |
| **Cognito** | User Pool `SiteGuardian` | Email-based auth, JWT tokens |
| **S3** | `siteguardian-screenshots` | Screenshot and visual diff storage |
| **SSM** | `/siteguardian/gemini-api-key` (SecureString) | Gemini API key (encrypted, read at runtime) |
| **SES** | Email identity | Regression alert emails |
| **EventBridge** | Scheduler rules | Triggers automated scans (daily/weekly) |

## Regression Detection

Pure numeric comparison — zero AI involved in detection:

| Metric | Threshold | Direction | What it means |
|--------|-----------|-----------|---------------|
| Performance Score | 5 points | decrease | Overall page speed dropped |
| Accessibility Score | 5 points | decrease | Accessibility got worse |
| LCP | 0.5s | increase | Main content loads slower |
| CLS | 0.05 | increase | More layout shift (things jumping around) |
| INP | 50ms | increase | Page responds slower to clicks |
| Violation Count | 2 | increase | More accessibility issues found |

When a regression is detected, the AI pipeline runs:
1. Cache check (SHA-256 hash of metric values)
2. Rate limit check (atomic DynamoDB counter, 50/day)
3. SSM key fetch (cached in Lambda memory)
4. Gemini 2.5 Flash API call (thinking disabled, 1024 max tokens)
5. Cache write (30-day TTL)

Failure at any step is graceful — the regression is still recorded without an explanation.

## Local Development

### Prerequisites

- Node.js 20+
- AWS CLI configured (`aws sts get-caller-identity`)
- Google Chrome installed (for local scans)
- Terraform >= 1.5.0 (for infrastructure)

### Setup

```bash
git clone https://github.com/AaryamanBhardwaj/SiteGuardian.git
cd SiteGuardian

npm install
cd lambda/scan-engine && npm install && cd ../..
cd lambda/api && npm install && cd ../..
cd lambda/scheduler && npm install && cd ../..

cp .env.example .env.local
# Edit .env.local with your Cognito values
```

### Run (3 terminals)

```bash
# Terminal 1: Scan engine (port 4000)
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node lambda/scan-engine/dev-server.mjs

# Terminal 2: API server (port 4001)
AWS_REGION=us-east-1 \
  COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<your-pool-id> \
  node lambda/api/dev-server.mjs

# Terminal 3: Next.js frontend (port 3001)
npx next dev -p 3001
```

### Deploy to AWS

```bash
# 1. Infrastructure
cd terraform && terraform init && terraform apply

# 2. Store Gemini API key
aws ssm put-parameter --name "/siteguardian/gemini-api-key" \
  --type SecureString --value "YOUR_KEY" --region us-east-1

# 3. Build and push scan engine container
DOCKER_BUILDKIT=0 docker build --platform linux/amd64 \
  -t siteguardian-scan-engine lambda/scan-engine/
aws ecr get-login-password | docker login --username AWS \
  --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag siteguardian-scan-engine:latest \
  <account>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest

# 4. Deploy API Lambda
cd lambda/api && zip -r /tmp/api-lambda.zip . && \
  aws lambda update-function-code --function-name siteguardian-api \
    --zip-file fileb:///tmp/api-lambda.zip

# 5. Build and deploy frontend to S3 + CloudFront
npx next build
# Extract static HTML from .next/server/app/ and .next/static/
aws s3 sync out/ s3://siteguardian-frontend-static/
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

## Cost

| Service | Free Tier | Your Cost |
|---------|-----------|-----------|
| **S3** | 5 GB (12 months) | $0 |
| **CloudFront** | 1 TB transfer + 10M requests/month (permanent) | $0 |
| **Lambda** | 1M requests + 400K GB-s/month | $0 |
| **DynamoDB** | 25 GB + 25 WCU/RCU (permanent) | $0 |
| **API Gateway** | 1M requests/month (12 months) | $0 |
| **Cognito** | 50K MAUs (permanent) | $0 |
| **ECR** | 500 MB (permanent) | ~$0.04/month (1 image, lifecycle policy) |
| **SSM** | Free for standard params | $0 |
| **SES** | 62K emails/month (from EC2/Lambda) | $0 |
| **Gemini API** | Free tier | $0 |

**Total: ~$0.04/month** — effectively free. The only non-zero cost is ECR storing the scan engine container image (~400MB).

## Terraform Modules

```
terraform/
├── main.tf              # Wires modules together
├── variables.tf         # Input variables
├── outputs.tf           # Cognito IDs, Lambda URLs, bucket name
├── versions.tf          # Provider constraints
└── modules/
    ├── dynamodb/        # 5 tables with on-demand billing + TTL
    ├── s3/              # Screenshots bucket + lifecycle rules
    ├── cognito/         # User pool + app client
    ├── lambda/          # 3 functions + IAM roles + permissions
    ├── eventbridge/     # Scheduler IAM role
    └── ses/             # Email identity verification
```

## License

Copyright (c) 2026 Aaryaman Bhardwaj. All Rights Reserved.

This project is source-available for viewing and educational purposes only. See [LICENSE](LICENSE) for full terms.
