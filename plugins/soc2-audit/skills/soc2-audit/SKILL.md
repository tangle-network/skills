---
name: soc2-audit
description: Run a SOC2 security audit against infrastructure and codebase. Scans servers for misconfigurations, reviews code for vulnerabilities, maps findings to Trust Service Criteria, generates tiered remediation checklist. Use when asked to "run soc2 audit", "security audit", "compliance check", "audit this infrastructure", or preparing for Vanta/Drata onboarding.
---

# SOC2 Security Audit

Performs a comprehensive SOC2 Type II readiness assessment across infrastructure, codebase, and operational controls. Produces a prioritized remediation checklist mapped to Trust Service Criteria.

## When to Use

- Preparing for SOC2 audit (Vanta, Drata, Secureframe)
- Security review of infrastructure
- Compliance gap analysis
- After significant infrastructure changes
- Periodic security posture check

## Audit Process

### Phase 1: Infrastructure Scan

SSH into each server and check:

```bash
# For each server, collect:
hostname && uname -r
cat /etc/os-release | head -2

# 1. SSH hardening
grep -E "PasswordAuthentication|PermitRootLogin|AllowUsers" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null | grep -v "^#"

# 2. Firewall
ufw status verbose 2>/dev/null || iptables -L -n | head -20

# 3. Exposed ports (CRITICAL — Docker bypasses UFW)
ss -tlnp | grep "0.0.0.0"
docker ps --format '{{.Names}} {{.Ports}}'
iptables -L DOCKER-USER -n 2>/dev/null

# 4. File permissions on secrets
stat -c "%a %n" /opt/*/.env 2>/dev/null
ls -la /root/.ssh/authorized_keys

# 5. Privileged containers
docker inspect --format '{{.Name}} privileged={{.HostConfig.Privileged}}' $(docker ps -q) 2>/dev/null

# 6. Security tooling
systemctl status auditd fail2ban unattended-upgrades 2>/dev/null | grep -E "Active:|not found"
which aide trivy falco 2>/dev/null
docker ps --format '{{.Names}}' | grep -iE "falco|wazuh|ossec"

# 7. Pending updates
apt list --upgradable 2>/dev/null | grep -i security | head -5

# 8. Authorized keys audit
cat /root/.ssh/authorized_keys | awk '{print $NF}'
```

### Phase 2: Codebase Scan

```bash
# 1. Hardcoded secrets (exclude tests, examples, env files)
grep -rn "password\|secret\|api_key" --include="*.ts" src/ apps/ | grep -v "test\|mock\|example\|\.env\|process\.env\|config\." | head -20

# 2. Shell injection — exec() with string interpolation
grep -rn 'exec(`\|exec("' --include="*.ts" apps/ | grep -v test | head -10
# Fix: use execFile() with argument arrays

# 3. Default root users
grep -rn "DEFAULT.*USER.*root\|user.*\"root\"" --include="*.ts" apps/*/src/config* | head -5

# 4. Empty auth key defaults
grep -rn "adminApiKey.*\"\"\\|apiKey.*||.*\"\"" --include="*.ts" apps/ | grep -v test | head -5
# CRITICAL: safeCompare("","") returns true — empty key = auth bypass

# 5. Credential leakage in logs
grep -rn "logger.*token\|logger.*key\|logger.*secret\|logger.*password" --include="*.ts" apps/ | grep -v test | head -10

# 6. Security headers
grep -rn "secureHeaders\|helmet\|HSTS\|Content-Security-Policy" --include="*.ts" apps/ | head -5

# 7. CORS config
grep -rn "cors\|CORS\|Access-Control" --include="*.ts" apps/*/src/ | grep -v test | head -5

# 8. Input validation
grep -rn "zod\|z\.object\|z\.string" --include="*.ts" apps/*/src/routes/ | head -5

# 9. Timing-safe comparison in auth
grep -rn "timingSafeEqual\|safeCompare\|constantTime" --include="*.ts" apps/ | head -5

# 10. Gitignore coverage
cat .gitignore | grep -E "\.env|\.key|\.pem|\.crt|credentials"
```

### Phase 3: SOC2 Control Mapping

Rate each control as PASS, PARTIAL, or FAIL:

| Control | Area | What to Check |
|---------|------|--------------|
| CC6.1 | Logical access | MFA, least privilege, key-only SSH, non-root users |
| CC6.2 | Access provisioning | Access register, joiner/leaver process, quarterly reviews |
| CC6.3 | Access authorization | CODEOWNERS, branch protection, separation of duties |
| CC6.6 | Threat protection | Firewall, IDS/EDR, patching, EOL systems |
| CC6.7 | Data transmission | mTLS, TLS everywhere, data classification, encryption at rest |
| CC6.8 | Unauthorized software | Image scanning, signing, file integrity monitoring |
| CC7.1 | Monitoring | Metrics, uptime monitoring, alerting, dashboards |
| CC7.2 | Anomaly detection | SIEM/auditd, audit log separation, security event logging |
| CC7.3 | Security event eval | Triage procedure, severity classification |
| CC7.4 | Incident response | IR plan, roles, communication templates, tabletop exercises |
| CC8.1 | Change management | PR reviews, CI gates, deployment approvals, change log |
| CC9.1 | Risk mitigation | Risk register, quarterly reviews, acceptance criteria |
| A1.2 | Recovery planning | DR plan, RTO/RPO, backup testing, failover procedures |

### Phase 4: Generate Remediation Checklist

Output a tiered checklist:

- **T0 (Before audit):** MFA, policies (IR, DR, Access, Change Mgmt), critical code fixes, .env permissions
- **T1 (Within 2 weeks):** Non-root users, CODEOWNERS, auditd, monitoring
- **T2 (Within 30 days):** Image scanning, audit log separation, data classification, backup verification
- **T3 (Within 90 days):** Risk register, FIM, tabletop exercises, advanced controls

Each item should include:
- SOC2 control reference
- Concrete remediation command or steps
- Evidence guidance (what to screenshot/save for Vanta)

## Hard-Won Lessons

These are real production issues found during audits:

1. **Docker bypasses UFW.** Published container ports are reachable even with `ufw deny`. Use `iptables -I DOCKER-USER` rules or bind to `127.0.0.1:port:port`.

2. **`exec()` vs `execFile()`.** `exec()` spawns a shell and enables injection. `execFile()` with argument arrays does not. Always check `cache-worker`, `build scripts`, anywhere shell commands are constructed.

3. **`safeCompare("","")` returns true.** If an auth key defaults to `""`, empty Authorization headers pass validation. Always validate keys are non-empty at startup.

4. **Falco rule syntax changes between versions.** The `enabled: false` override syntax from Falco <0.36 is deprecated in 0.39+. Use `override: { enabled: replace }` blocks.

5. **`aideinit` takes 30-45 minutes per server.** Plan accordingly when deploying AIDE across a fleet.

6. **Run `pnpm biome check --write` before committing.** Many repos have CI guardrails that reject unformatted code. Always check what linter/formatter the project uses and run it locally.

7. **Branch off `develop`, not whatever's checked out.** Always explicitly `git checkout develop && git pull` before creating fix branches.

8. **Restic backup "encryption" means nothing with a default password.** Grep for `"default-restic-password"` or similar fallbacks. Fail hard if backup password is unset.

9. **Cloudflare Workers secrets are not in `wrangler.toml`.** They're set via `wrangler secret put`. Check the Cloudflare dashboard for the actual values.

10. **Product auth keys (`orch_prod_...`) require registration.** The orchestrator must have the product in its store (via `SEED_PRODUCTS` env or admin API). A valid-looking key that isn't registered returns 401.

## Output Format

Generate a markdown checklist with progress tracking:

```markdown
### Progress
| Tier | Total | Done | Remaining |
|------|-------|------|-----------|
| T0   | N     | 0    | N         |
| T1   | N     | 0    | N         |
...

### T0 — Before Audit
- [ ] **Item** — Description. *Evidence: what to save.*
```

## Policy Document Templates

When generating policy docs, use these structures:

- **IR Plan:** Severity levels (P0-P3) with SLAs, roles (IC/TL/CL), 6-phase process, breach notification (72hr GDPR)
- **DR Plan:** Service inventory with RTO/RPO, backup strategy, recovery procedures per scenario, quarterly test commitment
- **Access Management:** Least privilege, MFA required, request/approval workflow, quarterly reviews, joiner/leaver checklists
- **Change Management:** PR required, CODEOWNERS review, CI gates, staging-first, emergency change process with 24hr retro review
- **Risk Register:** Score = Likelihood(1-5) x Impact(1-5). >=15 requires active mitigation. Quarterly review cadence.
