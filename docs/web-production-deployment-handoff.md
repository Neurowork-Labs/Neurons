# Web App Production Deployment Runbook (DigitalOcean)

This document is a strict step-by-step handoff for production deployment of the web app.

## Project Information

- Repository: `https://github.com/yagnikposhiya/Neurons`
- Clone URL: `https://github.com/yagnikposhiya/Neurons`
- Branch: `main`
- App directory: `apps/web`
- Framework: Next.js
- Package manager: npm
- Runtime: Node.js 20 LTS

---

## Step 1: Freeze the Release Version

1. Merge final changes into `main`.
2. Pull latest code locally.
3. Get exact deploy commit SHA:
   - `git rev-parse HEAD`
4. Share that SHA with DevOps so they deploy the exact version.

---

## Step 2: Validate Build Before Handoff

Run all commands from `apps/web`:

1. `npm install`
2. `npm run build`
3. `npm run lint`

Send a small report to DevOps:

- Build status: pass/fail
- Lint status: errors/warnings count
- Known accepted warnings (if any)

---

## Step 3: Prepare Secrets and Environment Variables

1. Collect all required env variable names from app usage.
2. Place values in a secure secret manager (not in chat/email).
3. Mark each variable as:
   - Production-only
   - Shared across environments
4. Ensure these categories are covered:
   - `NODE_ENV=production`
   - `PORT` (if required by hosting setup)
   - `NEXT_PUBLIC_*` client variables
   - Server-only API secrets
   - Database connection variables
   - Supabase variables (if applicable)
5. Confirm `.env` is never committed to git.

---

## Step 4: Share Code Access with DevOps

Provide DevOps these exact details:

1. Repository: `https://github.com/yagnikposhiya/Neurons`
2. Branch: `main`
3. Commit SHA: `<COMMIT_SHA>`
4. App path: `apps/web`
5. Confirm they have repo read access.

Preferred approach: Git-based deployment (not zip transfer).

---

## Step 5: Deployment Path Decision on DigitalOcean

Choose one of the following.

### Path A: App Platform (recommended)

DevOps configuration:

1. Connect repo `yagnikposhiya/Neurons`
2. Branch: `main`
3. Source directory/root: `apps/web`
4. Install command: `npm install`
5. Build command: `npm run build`
6. Run command: `npm run start`
7. Node version: 20 LTS
8. Add all env vars in App Platform secrets
9. Attach domain and enable TLS

### Path B: Droplet (custom infra)

DevOps configuration:

1. Provision droplet
2. Install Node.js 20 LTS
3. Clone repo and checkout `<COMMIT_SHA>`
4. Set env vars securely on server
5. Run app from `apps/web`
6. Build and start using process manager (PM2/systemd) or Docker
7. Configure Nginx/Caddy reverse proxy
8. Configure TLS with Let's Encrypt

---

## Step 6: Production Runtime Commands

From `apps/web`:

1. Install dependencies:
   - `npm install`
2. Build app:
   - `npm run build`
3. Start app:
   - `npm run start`

Runtime note:
- App serves on default Next.js port unless `PORT` is set by platform.

---

## Step 7: Domain, DNS, and HTTPS

1. Set production domain (example: `app.example.com`)
2. Point DNS to DigitalOcean endpoint/IP
3. Enable SSL/TLS certificate
4. Verify automatic redirect `http -> https`

---

## Step 8: Post-Deployment Verification Checklist

After deploy, verify in order:

1. Home page loads successfully
2. Authentication flow works
3. Core dashboard pages render correctly
4. Critical API routes respond successfully
5. DB-connected pages load expected data
6. Browser console has no blocking errors
7. Server logs show no startup/runtime crashes
8. Domain and TLS are correct

---

## Step 9: Rollback Plan (Required)

DevOps must support:

1. Rollback to previous stable release/artifact
2. Rollback by previous commit SHA
3. Rollback target time (example: within 10 minutes)

Keep release log for every deploy:

- Commit SHA
- Deployment date/time
- Deployer name
- Change summary

---

## Step 10: Copy-Paste Message to Send DevOps

```txt
Please deploy our web app to DigitalOcean production.

Repository: https://github.com/yagnikposhiya/Neurons
Clone URL: https://github.com/yagnikposhiya/Neurons
Branch: main
Commit SHA: <COMMIT_SHA>
Application directory: apps/web
Framework: Next.js
Node version: 20 LTS

Install command: npm install
Build command: npm run build
Start command: npm run start

Environment variables: shared securely in <VAULT/SECRET_MANAGER>.
Domain: <DOMAIN>
Zero downtime required: <YES/NO>
Rollback requirement: previous stable release within <X> minutes.

Please confirm after deployment with:
1) Live URL
2) Deployed commit SHA
3) Any warnings/issues
```
