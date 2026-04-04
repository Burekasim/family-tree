# Family Tree (עץ משפחה)

A serverless Hebrew family tree application. Built with vanilla JS + SVG on the frontend and AWS Lambda + DynamoDB on the backend. Deployed via GitHub Actions with OIDC authentication — no AWS keys stored in the repo.

## Architecture

```
Browser → CloudFront → /api/*       → API Gateway → Lambda → DynamoDB
                     → /uploads/*   → S3 (photos)
                     → /*           → S3 (frontend)
```

## Prerequisites

- AWS account
- Custom domain with a hosted zone in Route 53 (or elsewhere)
- ACM certificate for the domain **in us-east-1** (required by CloudFront)
- GitHub repository
- AWS CLI and SAM CLI installed locally (for first-time setup)

---

## First-time Setup

### 1. Fork / clone the repository

```bash
git clone https://github.com/your-org/family-tree.git
cd family-tree
```

### 2. Create the ACM certificate

In the AWS console, go to **Certificate Manager → us-east-1 region** and request a public certificate for your domain (e.g. `family.example.com`). Validate via DNS. Copy the certificate ARN — you will need it in step 5.

### 3. Create an OIDC role for GitHub Actions

GitHub Actions uses OIDC to assume an IAM role — no long-lived access keys needed.

1. In the AWS console, go to **IAM → Identity providers** and add a new provider:
   - Provider type: **OpenID Connect**
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

2. Create an IAM role with the following trust policy (replace `YOUR_GITHUB_ORG/YOUR_REPO`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

3. Attach the **AdministratorAccess** policy to the role (or a custom policy with permissions for S3, CloudFront, DynamoDB, Lambda, API Gateway, IAM, and CloudFormation). Copy the role ARN.

### 4. Create a GitHub environment

In your GitHub repository, go to **Settings → Environments** and create an environment named **`prod`**.

### 5. Set environment variables and secrets

In the `prod` environment, add:

| Type | Name | Value |
|------|------|-------|
| Variable | `AWS_ROLE_ARN` | IAM role ARN from step 3 |
| Variable | `AWS_REGION` | e.g. `eu-west-1` |
| Variable | `DOMAIN_NAME` | e.g. `family.example.com` |
| Variable | `CERTIFICATE_ARN` | ACM certificate ARN from step 2 |
| Secret | `API_TOKEN` | Any strong random string — used as the API bearer token |

### 6. Point your domain to CloudFront

After the first deploy completes, go to **CloudFront → your distribution** and copy the distribution domain name (e.g. `d1234abcd.cloudfront.net`). Create a DNS `CNAME` record:

```
family.example.com  →  d1234abcd.cloudfront.net
```

### 7. Deploy

Push to `main` — GitHub Actions will build and deploy automatically:

```bash
git push origin main
```

The first deploy takes ~5–10 minutes (CloudFront distribution creation). Subsequent deploys take ~2–3 minutes.

---

## Local Development

The project includes a local Express server that mirrors the Lambda handler.

```bash
npm install
node server.js
```

Open `http://localhost:3000`. Data is stored in a local SQLite file (`db/family.db`).

To install backend Lambda dependencies separately:

```bash
cd backend
npm install
```

---

## How it Works

### Authentication

When you open the app, a password gate appears. Enter any **last name** that exists in the tree. The app calls `POST /api/auth` with the last name, which is matched case-insensitively against DynamoDB. On success, a bearer token is returned and stored in `sessionStorage` for the rest of the session.

### Adding people

- Click **＋ אדם** to add a person. Optionally link them to a parent or spouse at creation time.
- Click a card to open the detail panel. From there you can edit, delete, or add relationships.

### Photos

Photos are uploaded directly to S3 via presigned URLs. The browser resizes images client-side (max 1200px, JPEG 85%) before uploading to keep storage costs low.

### Auto-inherit children

When two people are linked as a couple, the app automatically adds each person as a co-parent of the other's existing children. This keeps the tree consistent without manual re-entry.

---

## Project Structure

```
├── .github/workflows/deploy.yml   # CI/CD pipeline
├── backend/
│   └── handler.js                 # Lambda handler (all API routes)
├── public/
│   ├── index.html
│   ├── style.css
│   ├── tree.js                    # SVG layout and rendering
│   └── app.js                     # UI logic, API calls
├── template.yaml                  # AWS SAM / CloudFormation template
└── server.js                      # Local dev server (Express + SQLite)
```

---

## Environment Variables (Lambda)

Set automatically by SAM from `template.yaml` parameters:

| Variable | Description |
|----------|-------------|
| `PEOPLE_TABLE` | DynamoDB table name for people |
| `RELS_TABLE` | DynamoDB table name for relationships |
| `PHOTOS_BUCKET` | S3 bucket name for photo uploads |
| `PHOTOS_URL` | Base URL for photos (CloudFront domain) |
| `API_TOKEN` | Bearer token for API authentication |
