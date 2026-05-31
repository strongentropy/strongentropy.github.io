# Threat Model — Strong Entropy

Version: 1.0.0 | Last updated: 2026-05-30

> **Note:** This document covers system architecture, trust boundaries, attack surfaces, and mitigations. Residual risk assessments and open items are maintained in the private administration repository.

## System overview

```
Internet → Cloudflare Worker → GitHub Pages (static site)
                ↓ logVisit()
           Cloudflare KV
                ↓ flushToGitHub() (daily cron + /flush)
           GitHub logs repo (private)
                ↑ serveLogs() → /api/logs → /graph/ (browser)
```

All inbound traffic passes through the Cloudflare Worker. There is no origin server accessible directly from the internet.

---

## Trust boundaries

| Boundary | Description |
|---|---|
| Internet → Worker | Fully untrusted. All input validated at this layer. |
| Worker → GitHub Pages | Trusted proxy; Worker controls headers added/removed. |
| Worker → Cloudflare KV | Trusted within the same Worker runtime. |
| Worker → GitHub API | Authenticated via fine-grained PAT; GitHub API responses treated as trusted but validated. |
| Browser → /api/logs | Authenticated (Basic Auth) + same-origin CORS enforcement. |
| Browser → /graph/ | Authenticated (Basic Auth); serves static JS from GitHub Pages. |

---

## Attack surface

### 1. `/graph/` and `/api/logs` — Basic Auth endpoint

**Threats:**
- **Credential brute force** — repeated guesses against the Basic Auth gate
- **Timing oracle** — timing differences in auth comparison leaking credential length or content
- **Auth bypass** — malformed `Authorization` header edge cases

**Mitigations:**
- `timingSafeEqual()` (XOR-based, constant-time) prevents timing oracle
- Cloudflare rate limiting (60 req/60s per IP) limits brute-force throughput
- `atob()` decode wrapped in try-catch; any malformed base64 returns 401
- CORS `Origin` header checked against `https://strongentropy.com` on `/api/logs`

---

### 2. `/flush` — Token-authenticated admin endpoint

**Threats:**
- **Token brute force** — guessing the 48-char hex flush token
- **Timing oracle** — same as above
- **Replay attack** — captured token reused

**Mitigations:**
- `timingSafeEqual()` for token comparison
- Token is 48 hex characters (192 bits of entropy) — brute force infeasible
- Cloudflare rate limiting applies to all paths including `/flush`

---

### 3. `logVisit()` — Untrusted header ingestion

**Threats:**
- **Log injection** — crafted headers (`User-Agent`, `Referer`, `CF-Connecting-IP`) containing malicious content stored in KV and later flushed to GitHub
- **KV poisoning** — malformed log entries disrupting `flushToGitHub()` or `serveLogs()`
- **Oversized payloads** — excessively large header values exhausting KV storage

**Mitigations:**
- Log entries are stored as JSON (`JSON.stringify`) — structure is enforced on write
- `JSON.parse` in `flushToGitHub` is wrapped in try-catch; corrupt entries are skipped
- `ts` field validated against `YYYY-MM-DD` regex before use as a GitHub file path — prevents path traversal via malformed timestamps
- Cloudflare Workers enforce header size limits at the platform level

---

### 4. `serveLogs()` / `flushToGitHub()` — GitHub API interaction

**Threats:**
- **Path traversal** — malformed `ts` value used to write outside `logs/` directory
- **Content injection** — NDJSON content written to GitHub containing crafted data rendered in the graph
- **GitHub API response spoofing** — unexpected content-type or malformed JSON from GitHub API

**Mitigations:**
- `ts` validated against `DATE_RE = /^\d{4}-\d{2}-\d{2}$/` before constructing file path
- GitHub API `content-type` header checked before calling `.json()`
- Fine-grained PAT scoped to single private repo with contents write only — compromise cannot affect other repos or org settings
- `days` parameter validated: `Math.min(Math.max(parseInt(...) || 30, 1), 365)` — NaN and out-of-range values handled

---

### 5. `/graph/` client-side rendering — D3 force graph

**Threats:**
- **XSS via log data** — attacker-controlled log fields rendered into DOM
- **ReDoS** — crafted `User-Agent` strings causing catastrophic backtracking in `parseUA()` regexes
- **Prototype pollution** — malformed JSON from `/api/logs` polluting Object prototype

**Mitigations:**
- `escHtml()` applied to all node labels and values before `innerHTML` assignment
- CSP: `script-src 'self'` — inline scripts and external sources blocked
- `parseUA()` regexes are simple prefix/substring patterns with no quantifier nesting — ReDoS risk is low; confirmed by fuzzer (200k+ runs, no hangs)
- JSON parsed via native `JSON.parse` — not susceptible to prototype pollution in V8

---

## Critical code paths

| Path | Risk | Primary control |
|---|---|---|
| `isAuthenticated()` | Auth bypass | `timingSafeEqual()`, try-catch on `atob()` |
| `timingSafeEqual()` | Timing oracle | XOR-based constant-time comparison |
| `checkRateLimit()` | DoS / brute-force | KV-backed sliding window, 60 req/60s |
| `logVisit()` header parsing | Log injection | JSON serialisation, KV TTL, platform header limits |
| `flushToGitHub()` KV → GitHub | Path traversal, data corruption | `DATE_RE` validation, try-catch on parse |
| `serveLogs()` GitHub → browser | Data exposure, content-type confusion | Auth gate, content-type check, CORS |
| `buildGraph()` / `escHtml()` | XSS | `escHtml()`, strict CSP |
| `parseUA()` | ReDoS | Simple regexes, fuzz-verified |

---

## Out of scope

- Cloudflare platform-level attacks (DDoS, BGP hijack, datacenter compromise) — mitigated by Cloudflare's infrastructure
- GitHub platform compromise — outside project control
- Attacker with access to Cloudflare dashboard or GitHub org — addressed in secrets and collaborator policies (SECURITY.md)
- Browser vulnerabilities — mitigated by CSP, HSTS, security headers
