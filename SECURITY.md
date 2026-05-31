# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in any Strong Entropy LLC project, please report it responsibly — do not open a public issue.

**Contact:** [info@strongentropy.com](mailto:info@strongentropy.com)

For sensitive disclosures, please encrypt your message using our PGP public key:

- **Algorithm:** Ed25519
- **Fingerprint:** `3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4`
- **Key file:** https://strongentropy.com/strongentropy.asc

We will acknowledge receipt within 48 hours and aim to resolve confirmed vulnerabilities within 30 days.

## Scope

This policy covers strongentropy.com and all repositories under the [@strongentropy](https://github.com/strongentropy) GitHub organization.

## Threat Model

A threat model and attack surface analysis covering critical code paths, trust boundaries, and mitigations is maintained in [THREAT_MODEL.md](./THREAT_MODEL.md).

## Collaborator Access Policy

Strong Entropy LLC is a single-maintainer project. No external collaborators are granted write or admin access to this repository or its associated infrastructure.

Any future addition of a collaborator with escalated permissions (repository write/admin, Cloudflare account access, or GitHub organization membership) requires:

1. **Identity verification** — confirmed real identity via a known communication channel before access is granted
2. **Least-privilege assignment** — access scoped to only the specific resources and permissions required for the defined role
3. **Review period** — a minimum 30-day observation period as a read-only collaborator before any write permissions are granted
4. **Key verification** — GPG key fingerprint confirmed out-of-band before any signed-commit privileges are trusted
5. **Documented approval** — access grant recorded in a private access log with justification and scope

Collaborators with escalated permissions are reviewed at least annually. Access is revoked immediately upon role change or at the collaborator's request.

## Secrets and Credentials Policy

### Secrets in use

| Secret | Purpose | Storage |
|---|---|---|
| `GRAPH_PASSWORD` | HTTP Basic Auth for `/graph/` and `/api/logs` | Cloudflare Worker secret, local `.env.local` |
| `FLUSH_TOKEN` | Auth for on-demand `/flush` endpoint | Cloudflare Worker secret, local `.env.local` |
| `GITHUB_TOKEN` | Write access to private log repository | Cloudflare Worker secret |
| `ORIGIN` | GitHub Pages origin URL | Cloudflare Worker secret |
| GPG Ed25519 key | Signed commits and release tags | Local keychain only |

### Storage

- **Production secrets** are stored exclusively as [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — encrypted at rest, never in source code or logs.
- **Local development** uses `.env.local` (gitignored, never committed). The `.gitleaks.toml` pre-commit hook scans staged files for accidental secret exposure before every commit.
- **CI/CD** workflows require no project secrets — they use only the automatically provisioned `GITHUB_TOKEN` with minimum necessary permissions.
- The GPG private key never leaves the owner's local keychain and is not stored in any cloud service.

### Access

- Production secrets are accessible only to the Cloudflare Worker runtime and the repository owner.
- The `GITHUB_TOKEN` used by the Worker is a fine-grained personal access token scoped to the single private log repository with contents write permission only.
- No secrets are passed to CI runners or logged in workflow output.

### Rotation

| Secret | Rotation trigger | Maximum age |
|---|---|---|
| `GRAPH_PASSWORD` | Suspected compromise or annually | 12 months |
| `FLUSH_TOKEN` | Suspected compromise or annually | 12 months |
| `GITHUB_TOKEN` | Suspected compromise, personnel change, or annually | 12 months |
| GPG key | Suspected compromise or key algorithm deprecation | — |

Rotation procedure: generate new value → update Cloudflare Worker secret via `wrangler secret put` → update `.env.local` → verify with `make test-auth`.

### Incident response

If a secret is suspected compromised: revoke immediately via the issuing platform (Cloudflare dashboard or GitHub Settings), rotate per the table above, and review Worker and GitHub audit logs for unauthorized use.
