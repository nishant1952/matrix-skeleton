# Local Setup Guide

Complete setup guide for developers working with this CDK infrastructure repo.

**Estimated Setup Time:** 30-45 minutes

---

## Prerequisites Installation

### 1. Node.js (Required for CDK)

**macOS:**
```bash
# Using Homebrew (recommended)
brew install node

# Or download from https://nodejs.org/en/download/
```

**Windows:**
- Download from https://nodejs.org/en/download/
- Run the installer, ensure "Add to PATH" is checked

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verify (all platforms):**
```bash
node --version   # Should show v18.x or higher
npm --version    # Should show 9.x or higher
```

---

### 2. AWS CLI v2

**macOS:**
```bash
brew install awscli
```

**Windows:**
- Download and run: https://awscli.amazonaws.com/AWSCLIV2.msi

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Verify:**
```bash
aws --version   # Should show aws-cli/2.x.x
```

---

### 3. Git

**macOS:**
```bash
# Usually pre-installed. If not:
brew install git
```

**Windows:**
- Download from https://git-scm.com/download/win
- During install, select "Git from the command line and also from 3rd-party software"

**Linux:**
```bash
sudo apt-get install git
```

**Verify:**
```bash
git --version
```

---

### 4. Docker Desktop

**macOS:**
- Download from https://www.docker.com/products/docker-desktop/
- Drag to Applications and launch

**Windows:**
- Download from https://www.docker.com/products/docker-desktop/
- Requires WSL 2 (installer will prompt)

**Linux:**
```bash
# Install Docker Engine: https://docs.docker.com/engine/install/
sudo apt-get install docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER   # Run docker without sudo
```

**Verify:**
```bash
docker --version
docker ps        # Should show empty list, no error
```

---

### 5. AWS CDK CLI

```bash
npm install -g aws-cdk

# Verify
cdk --version    # Should show 2.x.x
```

---

### 6. TypeScript (Optional but Recommended)

```bash
npm install -g typescript

# Verify
tsc --version
```

---

## AWS Account Configuration

### 1. Get Your AWS Credentials

Contact your AWS administrator for:
- AWS Account ID (the one in `config/common.json`)
- IAM User with AdministratorAccess OR AWS SSO credentials

---

### 2. Configure AWS CLI Profile

Choose a profile name your team agrees on (e.g. `my-profile`).

#### Option A: Access Keys

```bash
aws configure --profile my-profile

# Enter when prompted:
# AWS Access Key ID: [from admin]
# AWS Secret Access Key: [from admin]
# Default region name: [your region, e.g. ap-south-1]
# Default output format: json
```

#### Option B: AWS SSO

```bash
aws configure sso --profile my-profile

# Follow prompts:
# SSO start URL: [your org's SSO URL]
# SSO region: [your SSO region]
# Account ID: [your account ID]
# Role: AdministratorAccess
# CLI profile name: my-profile
```

---

### 3. Verify AWS Access

```bash
aws sts get-caller-identity --profile my-profile

# Should show:
# {
#     "Account": "YOUR_ACCOUNT_ID",
#     "Arn": "arn:aws:iam::YOUR_ACCOUNT_ID:user/your-username"
# }
```

---

### 4. Set Default AWS Profile (Optional)

**macOS/Linux** (add to `~/.zshrc` or `~/.bashrc`):
```bash
export AWS_PROFILE=my-profile
```

**Windows PowerShell** (add to `$PROFILE`):
```powershell
$env:AWS_PROFILE = "my-profile"
```

---

## Project Setup

### 1. Clone and Install

```bash
git clone <YOUR_REPO_URL> matrix-skeleton
cd matrix-skeleton
npm install
```

### 2. Update Configuration

Edit `config/common.json` with your actual values:
- `accountId` — your AWS account ID
- `region` — your preferred AWS region
- `githubConnection` — your CodeConnections ARN (see GitHub CodeConnections section below)
- `hostedZone.id` and `hostedZone.name` — your Route53 hosted zone

Edit `config/projects.json` with your project details.

### 3. Compile and Verify

```bash
npm run build
cdk list --profile my-profile
```

You should see all your stack names listed.

### 4. Preview Infrastructure

```bash
cdk diff NetworkingStack --profile my-profile
```

---

## Bootstrap CDK (One-Time Per Account/Region)

**Check with your team first — this only needs to run once.**

```bash
# Check if already bootstrapped
aws cloudformation describe-stacks --stack-name CDKToolkit --profile my-profile

# If not, bootstrap:
cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION --profile my-profile
```

---

## GitHub CodeConnections (One-Time Per Account)

Connects AWS CodePipeline to your GitHub organization. Only one person needs to do this.

**Check if it already exists:**
```bash
aws codeconnections list-connections --profile my-profile
# If a connection with status "Available" exists, skip to updating config
```

**If not created:**
1. In AWS Console, go to **Developer Tools > Settings > Connections**
2. Click **"Create connection"** → select **GitHub**
3. Name it (e.g. `my-org-connection`)
4. Click **"Install a new app"** → authorize **AWS Connector for GitHub**
5. Select your GitHub organization and repository access
6. Click **Install & Authorize** — status should show **"Available"**

**Copy the connection ARN:**
```bash
aws codeconnections list-connections --profile my-profile \
  --query 'Connections[].[ConnectionName,ConnectionArn,ConnectionStatus]' \
  --output table
```

**Update config:**

Edit `config/common.json` and set the `githubConnection` field to your ARN:
```
arn:aws:codeconnections:<region>:<account-id>:connection/<uuid>
```

Then rebuild: `npm run build`

**Notes:**
- One connection serves all pipelines in the account
- The ARN is not a secret (safe to commit)
- Don't delete the GitHub App from GitHub (breaks all pipelines)
- Requires GitHub organization admin/owner permissions

---

## Verification Checklist

```bash
node --version                                      # Node.js
aws --version                                       # AWS CLI
git --version                                       # Git
docker --version && docker ps                       # Docker
cdk --version                                       # CDK CLI
aws sts get-caller-identity --profile my-profile    # AWS credentials
npm run build                                       # TypeScript compiles
cdk list --profile my-profile                       # CDK sees stacks
```

Verify AWS services are accessible (should return empty lists, not errors):
```bash
aws ecs list-clusters --profile my-profile
aws ecr describe-repositories --profile my-profile
aws codepipeline list-pipelines --profile my-profile
```

If any return "access denied", your IAM role needs more permissions (AdministratorAccess recommended for initial setup).

All commands should succeed without errors.

---

## Billing Alerts (Recommended)

Set up a budget in AWS Console:
1. Go to **Billing > Budgets**
2. Create a **cost budget** (e.g. $100/month)
3. Set alert at 80%
4. Add your email

---

## IDE Setup (Optional)

### VS Code

Install extensions:
- **ESLint** — code linting
- **Prettier** — code formatting
- **AWS Toolkit** — AWS integration
- **GitLens** — Git visualization

Open the project:
```bash
code /path/to/matrix-skeleton
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `aws: command not found` | Reinstall AWS CLI, restart terminal, check PATH |
| `cdk: command not found` | `npm install -g aws-cdk`, check npm global path |
| `npm install` permission errors | macOS/Linux: use `nvm`. Windows: run as Administrator |
| Docker commands fail | Ensure Docker Desktop is running |
| `cdk bootstrap` access denied | Verify IAM role has AdministratorAccess |
| Git "permission denied (publickey)" | Generate SSH key: `ssh-keygen -t ed25519` and add to GitHub |

---

## Personal vs Shared Resources

| Aspect | Personal (each developer) | Shared (one per team) |
|---|---|---|
| AWS Profile & Credentials | Your own keys/tokens | — |
| AWS Account ID & Region | — | Same for all (`config/common.json`) |
| Local File Paths | Your directory | — |
| Git Config (name/email) | Your own | — |
| CDK Bootstrap | — | Once per account/region |
| GitHub CodeConnection | — | Once per account |
| Repository Code & Config | — | Same for all |
| Deployed Infrastructure | — | Everyone sees the same |

---

## Safe vs Coordinated Commands

### Safe to Run Anytime
| Command | What it does |
|---|---|
| `npm run build` | Local compilation |
| `cdk list` | Lists stacks (read-only) |
| `cdk diff` | Previews changes (read-only) |
| `cdk synth` | Generates CloudFormation template (read-only) |
| `aws sts get-caller-identity` | Checks your credentials |
| `git pull` | Gets latest code |

### Ask Team Before Running
| Command | Why |
|---|---|
| `cdk deploy` | Modifies shared infrastructure |
| `cdk destroy` | Deletes shared resources permanently |
| `git push` | Affects team's codebase |
| Changing `config/common.json` | Affects everyone |

---

## Common Mistakes

| Mistake | Correct Approach |
|---|---|
| Sharing your AWS credentials | Each person gets their own from admin |
| Creating duplicate GitHub connections | Check if one exists first |
| Committing `.aws/credentials` | Never — it stays local |
| Running `cdk deploy` without checking | Always run `cdk diff` first |

---

## Next Steps

1. Read `INFRASTRUCTURE-OVERVIEW.md` for architecture details
2. Read `ADDING-NEW-SERVICE.md` to add your first service
3. Read `FREQUENT-COMMANDS.md` for day-to-day commands
4. **Do NOT deploy without team approval** — always run `cdk diff` first
