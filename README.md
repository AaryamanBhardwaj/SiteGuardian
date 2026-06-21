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

## Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Next.js    │────▶│  API Lambda       │────▶│  Scan Engine       │
│   Frontend   │     │  (Function URL)   │     │  Lambda Container  │
│   S3 + CDN   │     │                  │     │  Playwright +      │
└──────────────┘     │  Routes:         │     │  Lighthouse +      │
       │             │  /projects       │     │  axe-core          │
       │             │  /scans          │     └────────────────────┘
       ▼             │  /regressions    │              │
┌──────────────┐     │  /scan-now       │              │
│   Cognito    │     └──────────────────┘              ▼
│   Auth       │            │              ┌────────────────────┐
└──────────────┘            ▼              │  S3 Bucket         │
                     ┌──────────────┐      │  Screenshots +     │
                     │  DynamoDB    │      │  Visual Diffs      │
                     │  5 Tables    │      └────────────────────┘
                     └──────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
┌─────────────┐   ┌──────────────────┐   ┌─────────────┐
│ EventBridge │   │  SSM Parameter   │   │    SES      │
│ Scheduler   │   │  Store (Gemini   │   │  Email      │
│ (cron)      │   │  API key)        │   │  Alerts     │
└─────────────┘   └──────────────────┘   └─────────────┘
```

## AWS Services — What, Where, and Why

### 1. AWS Lambda (Compute)

Three Lambda functions power the backend, all using **Lambda Function URLs** (perpetual free tier — avoids API Gateway costs):

| Function | Runtime | Memory | Timeout | Purpose |
|----------|---------|--------|---------|---------|
| `siteguardian-api` | Node.js 20 (zip) | 256 MB | 30s | REST API — handles all authenticated routes: CRUD for projects, fetching scan results, fetching regressions, triggering manual scans |
| `siteguardian-scan-engine` | Container image | 2048 MB | 120s | Runs headless Chromium via Playwright, executes Lighthouse audits, runs axe-core accessibility checks, captures WebP screenshots |
| `siteguardian-scheduler` | Node.js 20 (zip) | 512 MB | 120s | Invoked by EventBridge on schedule — fetches all due projects, triggers scans, stores results, detects regressions, calls Gemini AI, sends email alerts |

**Why Lambda Function URLs instead of API Gateway?**
Lambda Function URLs have a perpetual free tier with no per-request charges. API Gateway charges $1/million requests + data transfer. For a free-tier-focused project, Function URLs eliminate the biggest ongoing cost.

**Why a container image for the scan engine?**
Playwright + Chromium exceeds Lambda's 50 MB zip deployment limit. The container image packages Chromium, Playwright, Lighthouse, axe-core, and Sharp (for WebP compression) into a single deployable Docker image pushed to ECR.

**IAM Roles — each Lambda gets its own least-privilege role:**
- **API Lambda role**: DynamoDB (read/write all 5 tables), S3 (put/get screenshots), SSM (read Gemini key), SES (send emails), CloudWatch Logs
- **Scan Engine role**: CloudWatch Logs only (it returns results directly, doesn't touch AWS storage)
- **Scheduler role**: Same as API role (it does everything the API does, but triggered by EventBridge instead of HTTP)

### 2. Amazon DynamoDB (Database)

All data storage uses DynamoDB with **on-demand billing** (PAY_PER_REQUEST) — zero cost at rest, pay only for reads/writes, no capacity planning.

| Table | Partition Key | Sort Key | Purpose |
|-------|--------------|----------|---------|
| `SiteGuardian-Projects` | `projectId` | — | Stores registered websites with URL, name, scan frequency, alert email. Has a GSI on `userId` for listing a user's projects. |
| `SiteGuardian-ScanResults` | `projectId` | `scanTimestamp` | Stores every scan result — performance score, accessibility score, Core Web Vitals (LCP, CLS, INP), violation count, screenshot S3 key, visual diff percentage. Sort key enables querying scans in chronological order. |
| `SiteGuardian-RegressionEvents` | `projectId` | `eventTimestamp` | Records each detected regression with metric name, before/after values, AI explanation text, and cause category. Uses composite sort key `{timestamp}#{metricName}` to allow multiple regressions per scan without key collision. |
| `SiteGuardian-ExplanationCache` | `signatureHash` | — | Caches AI explanations by a SHA-256 hash of bucketed metric values. Avoids redundant Gemini API calls for identical regressions. Has TTL enabled (30-day expiry). |
| `SiteGuardian-RateLimitCounters` | `dateKey` | — | Tracks daily Gemini API call count using DynamoDB conditional updates as an atomic counter. Has TTL enabled (2-day expiry). Prevents runaway AI costs. |

**Why DynamoDB over RDS/Aurora?**
DynamoDB on-demand has a generous free tier (25 GB storage, 25 WCU/25 RCU) and zero idle cost. RDS requires a running instance even with zero traffic. For a monitoring app with bursty scan-then-idle patterns, DynamoDB is significantly cheaper.

### 3. Amazon S3 (Object Storage)

A single S3 bucket (`siteguardian-screenshots`) stores:

- **`screenshots/{projectId}/{timestamp}.webp`** — WebP-compressed page screenshots captured by Playwright during each scan (compressed via Sharp to minimize storage)
- **`diffs/{projectId}/{timestamp}.png`** — Visual diff images generated by pixelmatch showing pixel-level differences between consecutive scans

**Configuration:**
- Public access blocked (all four public access settings disabled)
- 90-day lifecycle rule auto-deletes old screenshots to control storage costs
- In production, CloudFront serves the frontend static export from a separate S3 bucket

### 4. Amazon Cognito (Authentication)

Manages user signup, login, email verification, and JWT token issuance:

- **User Pool** — email-based authentication with password policy (min 8 chars, uppercase, lowercase, numbers)
- **App Client** — configured for SRP (Secure Remote Password) auth flow via `amazon-cognito-identity-js` (no Amplify dependency)
- **JWT Verification** — API Lambda verifies ID tokens against Cognito's JWKS endpoint on every authenticated request
- **Domain** — auto-generated Cognito domain with random suffix for hosted UI (used as fallback)

**Why Cognito over Auth0/Firebase?**
Cognito's free tier covers 50,000 MAUs. Auth0 free tier is 7,500. For a public-facing app, Cognito gives 6x more headroom at zero cost.

### 5. Amazon EventBridge Scheduler (Cron)

Triggers the scheduler Lambda on a configurable schedule (daily or weekly per project):

- **IAM Role** — dedicated role with `lambda:InvokeFunction` permission scoped to the scheduler Lambda ARN
- **Schedule Expression** — configured per project (e.g., `rate(1 day)` or `rate(7 days)`)
- The scheduler Lambda receives the `projectId` in the event payload, fetches the project, invokes the scan engine, processes results, and sends alerts

**Why EventBridge Scheduler over CloudWatch Events?**
EventBridge Scheduler supports one-time and recurring schedules with better timezone handling, retry policies, and dead-letter queues. It's the newer, recommended service.

### 6. Amazon SES (Email Alerts)

Sends regression alert emails when a scan detects metric degradation:

- **Email Identity** — Terraform creates an SES email identity verification for the alert sender address
- **Email Content** — HTML-formatted email listing each regression with metric name, before/after values, and magnitude
- **Trigger** — only fires when `regressions.length > 0` after a scan, and only if the project has `alertEmail` configured

**SES Sandbox Note:** New AWS accounts start in SES sandbox mode (can only send to verified emails). Request production access via the AWS console to send to any email.

### 7. AWS Systems Manager Parameter Store (Secrets)

Stores the Gemini API key as a **SecureString** parameter:

- **Path**: `/siteguardian/gemini-api-key`
- **Encryption**: AWS-managed KMS key (default)
- **Access**: Lambda reads it at runtime via `GetParameter` with `WithDecryption: true`
- **Caching**: The key is cached in-memory within the Lambda execution context to avoid repeated SSM calls

**Why SSM over Secrets Manager?**
SSM Parameter Store is free for standard parameters. Secrets Manager charges $0.40/secret/month + $0.05/10,000 API calls. For a single API key, SSM is the obvious choice.

### 8. Amazon CloudWatch (Logging)

All three Lambda functions write logs to CloudWatch Logs:

- Each function has its own log group (`/aws/lambda/siteguardian-{api,scan-engine,scheduler}`)
- IAM roles grant `logs:CreateLogGroup`, `logs:CreateLogStream`, and `logs:PutLogEvents`
- Useful for debugging scan failures, Gemini API errors, and DynamoDB issues

## Terraform Infrastructure as Code

All AWS resources are provisioned and managed via **Terraform** (>= 1.5.0, AWS provider ~5.0), organized into 6 modular components:

```
terraform/
├── main.tf              # Wires all modules together, passes outputs between them
├── variables.tf         # Input variables (region, project name, email, etc.)
├── terraform.tfvars     # Your actual values (not committed with secrets)
├── outputs.tf           # Exposes Cognito IDs, Lambda URLs, bucket name
├── versions.tf          # Provider and Terraform version constraints
└── modules/
    ├── dynamodb/        # 5 tables with on-demand billing and TTL
    ├── s3/              # Screenshots bucket with lifecycle rules
    ├── cognito/         # User pool, app client, domain
    ├── lambda/          # 3 functions, 3 IAM roles, 2 Function URLs
    ├── eventbridge/     # Scheduler IAM role for Lambda invocation
    └── ses/             # Email identity verification
```

### Module Dependency Graph

```
dynamodb ──┐
s3 ────────┼──▶ lambda ──▶ eventbridge
cognito ───┘
ses (independent)
```

The `lambda` module depends on outputs from `dynamodb` (table names/ARNs), `s3` (bucket name/ARN), and `cognito` (user pool ID/issuer URL). The `eventbridge` module depends on the scheduler Lambda ARN from the `lambda` module. The `ses` module is independent.

### Deploying Infrastructure

```bash
cd terraform

# Initialize providers and modules
terraform init

# Preview what will be created (26 resources)
terraform plan

# Create all resources
terraform apply

# When done, tear everything down
terraform destroy
```

### What `terraform apply` Creates (26 Resources)

| Module | Resources Created |
|--------|-------------------|
| **dynamodb** | 5 DynamoDB tables (on-demand, TTL on cache/rate-limit) |
| **s3** | 1 S3 bucket + lifecycle rule + public access block |
| **cognito** | User pool + app client + domain (random suffix) |
| **lambda** | 3 Lambda functions + 3 IAM roles + 3 IAM policies + 2 Function URLs + 2 archive data sources |
| **eventbridge** | 1 IAM role + 1 IAM policy for scheduler invocation |
| **ses** | 1 email identity verification |

## Regression Detection

Pure numeric comparison — zero AI involved in detection:

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Performance Score | 5 points | decrease |
| Accessibility Score | 5 points | decrease |
| LCP | 0.5s | increase |
| CLS | 0.05 | increase |
| INP | 50ms | increase |
| Violation Count | 2 | increase |

AI (Gemini 2.0 Flash-Lite) is called **only** when a regression is detected. The AI pipeline:
1. **Cache check** — SHA-256 hash of bucketed metric values; if seen before, return cached explanation
2. **Rate limit check** — atomic DynamoDB increment; if daily limit (50) exceeded, return null
3. **API key check** — fetch from SSM; if not configured, return null
4. **Gemini API call** — temperature 0.3, max 200 tokens, returns 2-3 sentence explanation
5. **Cache write** — store explanation with 30-day TTL for future reuse

At every step, failure is graceful — the regression is still recorded, just without an AI explanation.

## Local Development

### Prerequisites

- Node.js 20+
- AWS CLI configured with valid credentials (`aws sts get-caller-identity`)
- Google Chrome installed (used as the Chromium binary for local scans)
- Terraform >= 1.5.0 (for infrastructure deployment)

### 1. Clone and Install

```bash
git clone https://github.com/AaryamanBhardwaj/SiteGuardian.git
cd SiteGuardian

# Install frontend dependencies
npm install

# Install Lambda dependencies
cd lambda/scan-engine && npm install && cd ../..
cd lambda/api && npm install && cd ../..
cd lambda/scheduler && npm install && cd ../..
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Cognito values:

```
NEXT_PUBLIC_SCAN_API_URL=http://localhost:4000/scan
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

To get Cognito values, either:
- Deploy infrastructure first (`terraform apply`) and grab outputs
- Or create a Cognito User Pool manually in the AWS console

### 3. Run Dev Servers

You need three terminals running simultaneously:

```bash
# Terminal 1: Scan engine (port 4000)
# This runs Lighthouse + axe-core audits using your local Chrome
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node lambda/scan-engine/dev-server.mjs
```

```bash
# Terminal 2: API server (port 4001)
# This handles all authenticated API routes
AWS_REGION=us-east-1 \
  COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/<your-pool-id> \
  node lambda/api/dev-server.mjs
```

```bash
# Terminal 3: Next.js frontend (port 3001)
npx next dev -p 3001
```

Then open http://localhost:3001 in your browser.

### 4. Seed Demo Data (Optional)

```bash
cd lambda/scheduler
AWS_REGION=us-east-1 node ../../scripts/seed-demo-data.mjs
```

Creates a demo project with 7 days of scan history including an intentional regression on day 4 with pre-filled AI explanations.

### 5. Deploy to AWS

```bash
# Store your Gemini API key in SSM
aws ssm put-parameter --name "/siteguardian/gemini-api-key" \
  --type SecureString --value "YOUR_GEMINI_KEY" --region us-east-1

# Deploy infrastructure
cd terraform
terraform init
terraform plan
terraform apply

# Build and push the scan engine container
aws ecr create-repository --repository-name siteguardian-scan-engine
docker build -t siteguardian-scan-engine lambda/scan-engine/
docker tag siteguardian-scan-engine:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/siteguardian-scan-engine:latest
```

### 6. Required Manual Steps

1. **SES email verification** — click the verification link sent to your alert email address
2. **Cognito user creation** — sign up via the app or create users in the AWS console
3. **Update `terraform.tfvars`** — set `scan_engine_image_uri` to your ECR image URI after pushing

## Cost

All resources are designed for AWS free-tier constraints:

| Service | Free Tier | SiteGuardian Usage |
|---------|-----------|-------------------|
| Lambda | 1M requests + 400,000 GB-s/month | ~1,000 scans/month = well under limit |
| DynamoDB | 25 GB storage + 25 WCU/25 RCU | On-demand billing, minimal at low scale |
| S3 | 5 GB storage | Screenshots auto-expire after 90 days |
| Cognito | 50,000 MAUs | More than enough for any indie project |
| SES | 62,000 emails/month (from EC2) | Alerts only fire on regressions |
| SSM | Free for standard parameters | 1 parameter |
| EventBridge | Free tier covers scheduler | 1 schedule per project |

## License

Copyright (c) 2026 Aaryaman Bhardwaj. All Rights Reserved.

This project is source-available for viewing and educational purposes only. See [LICENSE](LICENSE) for full terms.
