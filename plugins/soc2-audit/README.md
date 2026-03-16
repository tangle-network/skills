# SOC2 Audit Skill

Run comprehensive SOC2 Type II readiness assessments against infrastructure and codebases.

## Usage

```
/soc2-audit
/soc2-audit infrastructure    # servers only
/soc2-audit codebase          # code only
/soc2-audit full              # both + policy generation
```

## What It Does

1. **Infrastructure scan** — SSH into servers, check ports, firewalls, permissions, security tooling
2. **Codebase scan** — grep for hardcoded secrets, shell injection, auth bypass, logging gaps
3. **SOC2 control mapping** — rate 13 Trust Service Criteria as PASS/PARTIAL/FAIL
4. **Remediation checklist** — tiered (T0-T3) with evidence guidance for Vanta/Drata
5. **Auto-fix** — permissions, gitignore, CODEOWNERS, port blocking where safe

## Includes

- 10 hard-won lessons from real production audits
- Policy document templates (IR, DR, Access, Change Mgmt, Risk Register)
- Docker-specific security checks (DOCKER-USER chain, privileged containers, port binding)
- Cloudflare Workers security checks
