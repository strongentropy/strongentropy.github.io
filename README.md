# Strong Entropy LLC

Quantitative FinTech · Cybersecurity · Automation and Enablement

**Website:** https://strongentropy.com  
**Email:** info@strongentropy.com

---

## Contact

For inquiries: [info@strongentropy.com](mailto:info@strongentropy.com)

To send encrypted communications, use the PGP public key below.

---

## PGP Public Key

**Algorithm:** Ed25519  
**Key ID:** 7AAAFCD4  
**Fingerprint:** `3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4`

Public key file: [strongentropy.asc](./strongentropy.asc)

To import:
```bash
curl -s https://raw.githubusercontent.com/strongentropy/strongentropy.github.io/main/strongentropy.asc | gpg --import
```

To verify fingerprint after import:
```bash
gpg --fingerprint info@strongentropy.com
```

---

## Testing

### Automated CI (runs on every push to `main` and weekly)

| Workflow | What it tests | When |
|---|---|---|
| **CodeQL** (`.github/workflows/codeql.yml`) | Static analysis of JavaScript for security vulnerabilities | Every push, every PR, weekly Monday 06:00 UTC |
| **Fuzz** (`.github/workflows/fuzz.yml`) | jazzer.js fuzzing of `parseUA`, `buildGraph`, `btoaUnicode/atobUnicode`, `timingSafeEqual` | Every push, every PR, weekly Monday 07:00 UTC |
| **Dependency Audit** (`.github/workflows/audit.yml`) | `npm audit --audit-level=moderate` on worker dependencies | On `package-lock.json` changes, weekly Monday 06:00 UTC |
| **OpenSSF Scorecard** (`.github/workflows/scorecard.yml`) | Supply chain security posture across 18 checks | Every push to `main`, weekly Monday 06:00 UTC |

CI results are visible in the [Actions tab](https://github.com/strongentropy/strongentropy.github.io/actions). All workflows must pass before the branch protection status checks are satisfied.

### Smoke tests (run manually against the live site)

Requires `GRAPH_PASSWORD` and `FLUSH_TOKEN` set in `.env.local`.

```bash
make test          # run all smoke tests
make test-headers  # verify security response headers
make test-auth     # verify /graph/ and /api/logs auth gates (401 without, 200 with)
make test-flush    # verify /flush endpoint responds with {ok: true}
```

These tests run against `https://strongentropy.com` and should be run after any worker deployment (`make deploy-worker`).

### Test update policy

All major changes to the Worker or graph code MUST include corresponding test coverage:

- **New input-processing functions** — add a jazzer.js fuzz target in `worker/fuzz/`
- **New API endpoints or auth paths** — add a `make test-*` smoke test and wire it into `make test`
- **Changes to existing fuzzed functions** — update the corresponding fuzz target to reflect new behaviour and add corpus seeds for new code paths
- **Security-relevant changes** — verify CodeQL and Scorecard continue to pass with no new findings

Pull requests and direct pushes that introduce major functionality without accompanying tests will not be merged. Minor changes (documentation, styling, configuration) are exempt.

### Exception: non-author human approval (OSPS-QA-07.01)

This project has a single human maintainer. OSPS-QA-07.01 requires at least one non-author **human** approval before merging to the primary branch — the reviewer is AI and therefore does not satisfy this requirement. Compensating controls in place:

- All commits are GPG-signed by the maintainer
- Branch protection blocks force-push and branch deletion
- Required CI status checks (CodeQL, fuzzing, npm audit) must pass before merge
- gitleaks pre-commit hook scans every staged commit for secret exposure

---

## Release Support Policy

This project follows a **rolling release** model — the live site always runs the latest commit on `main`, and tagged releases mark significant milestones.

| Release | Status | Supported until |
|---|---|---|
| `v1.0.0` (latest) | Active | Superseded by next release |
| Older releases | End of life | No further support |

**Scope of support:**
- Security vulnerabilities — patched in the current release as soon as practicable; no backports to older releases
- Bug fixes — applied to `main` only
- The live site at strongentropy.com always runs the current supported release

Only the **latest release** receives security fixes. Users self-hosting any portion of this codebase should upgrade to the latest tagged release promptly when a new one is published.

Security issues should be reported per the [Security Policy](./SECURITY.md).

---

## Verifying Releases

All releases are tagged with a GPG-signed git tag using the key above.

**1. Import the public key** (see above), then:

**2. Verify the tag signature:**
```bash
git clone https://github.com/strongentropy/strongentropy.github.io.git
cd strongentropy.github.io
git tag -v v1.0.0
```

Expected output includes:
```
gpg: Good signature from "Strong Entropy LLC <info@strongentropy.com>"
```

**3. Verify the tag fingerprint matches:**
```
3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4
```

**4. Verify the release commit:**
```bash
git log --show-signature v1.0.0 -1
```

Each release on the [Releases page](https://github.com/strongentropy/strongentropy.github.io/releases) lists the signing key fingerprint in the release notes.

### Software Bill of Materials

Each release includes a CycloneDX SBOM (`sbom.cdx.json`) attached as a release asset, listing all transitive dependencies of the Cloudflare Worker. To inspect it:

```bash
curl -sL https://github.com/strongentropy/strongentropy.github.io/releases/download/v1.0.0/sbom.cdx.json | python3 -m json.tool | less
```

### Verifying signer identity

A valid signature alone is not sufficient — you should also confirm the signing key belongs to Strong Entropy LLC. Cross-reference using at least one independent source:

| Source | Expected value |
|---|---|
| Signing identity in tag | `Strong Entropy LLC <info@strongentropy.com>` |
| Key fingerprint | `3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4` |
| Published at | https://strongentropy.com/strongentropy.asc |
| GitHub organization | https://github.com/strongentropy |

The same key is used for all commits in this repository and can be independently verified via the published key file on the website. If the fingerprint in a release does not match the above, do not trust the release.

```bash
# Confirm the key UID and fingerprint after import
gpg --fingerprint info@strongentropy.com
# Expected: 3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4

# Confirm the key is also used for commits (not just tags)
git log --show-signature --format="%H %aN" main | head -5
```
