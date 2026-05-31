# Strong Entropy LLC

Quantitative FinTech · Cybersecurity · Automation and Enablement

**Website:** https://strongentropy.com  
**Email:** info@strongentropy.com

[![OpenSSF Baseline](https://www.bestpractices.dev/projects/13050/baseline)](https://www.bestpractices.dev/projects/13050)

---

## Contact

For inquiries: [info@strongentropy.com](mailto:info@strongentropy.com)

For sensitive disclosures, use the PGP public key below to encrypt your message.

**Algorithm:** Ed25519  
**Key ID:** 7AAAFCD4  
**Fingerprint:** `3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4`

Public key file: [strongentropy.asc](./strongentropy.asc)

```bash
# Import
curl -s https://raw.githubusercontent.com/strongentropy/strongentropy.github.io/main/strongentropy.asc | gpg --import

# Verify fingerprint
gpg --fingerprint info@strongentropy.com
```

---

## Releases

### Support policy

This project follows a **rolling release** model — the live site always runs the latest commit on `main`, and tagged releases mark significant milestones.

| Release | Status | Supported until |
|---|---|---|
| `v1.0.0` (latest) | Active | Superseded by next release |
| Older releases | End of life | No further support |

Only the **latest release** receives security fixes — no backports. Bug fixes are applied to `main` only. Users self-hosting any part of this codebase should upgrade promptly when a new release is published.

Security issues should be reported per the [Security Policy](./SECURITY.md).

### Verifying a release

All releases are tagged with a GPG-signed git tag. To verify:

```bash
git clone https://github.com/strongentropy/strongentropy.github.io.git
cd strongentropy.github.io

# 1. Import the public key (see above), then verify the tag
git tag -v v1.0.0

# Expected output includes:
# gpg: Good signature from "Strong Entropy LLC <info@strongentropy.com>"

# 2. Verify the release commit
git log --show-signature v1.0.0 -1
```

Each release on the [Releases page](https://github.com/strongentropy/strongentropy.github.io/releases) lists the signing key fingerprint in the release notes.

### Verifying signer identity

A valid signature confirms the tag was signed with the private key — but you should also confirm the key belongs to Strong Entropy LLC. Cross-reference against at least one independent source:

| Source | Expected value |
|---|---|
| Signing identity in tag | `Strong Entropy LLC <info@strongentropy.com>` |
| Key fingerprint | `3F1A A06D A8C5 8ACE F25B  C882 3263 D1B8 7AAA FCD4` |
| Key published at | https://strongentropy.com/strongentropy.asc |
| GitHub organization | https://github.com/strongentropy |

```bash
# Confirm key UID and fingerprint
gpg --fingerprint info@strongentropy.com

# Confirm the key signs commits too, not just release tags
git log --show-signature --format="%H %aN" main | head -5
```

If the fingerprint in a release does not match the above, do not trust it.

### Software Bill of Materials

Each release includes a CycloneDX SBOM (`sbom.cdx.json`) and an OpenVEX document (`vex.openvex.json`) attached as release assets. The SBOM lists all transitive dependencies of the Cloudflare Worker; the VEX documents any known vulnerabilities in those dependencies and whether they affect this project.

```bash
# Inspect the SBOM
curl -sL https://github.com/strongentropy/strongentropy.github.io/releases/download/v1.0.0/sbom.cdx.json \
  | python3 -m json.tool | less

# Inspect the VEX document
curl -sL https://github.com/strongentropy/strongentropy.github.io/releases/download/v1.0.0/v1.0.0.openvex.json \
  | python3 -m json.tool | less
```

---

## Testing

### Automated CI

All workflows run on every push to `main` and weekly. Results are in the [Actions tab](https://github.com/strongentropy/strongentropy.github.io/actions).

| Workflow | What it tests | Schedule |
|---|---|---|
| **CodeQL** | Static analysis of JavaScript for security vulnerabilities | Every push, every PR, weekly Mon 06:00 UTC |
| **Fuzz** | jazzer.js fuzzing of `parseUA`, `buildGraph`, `btoaUnicode/atobUnicode`, `timingSafeEqual` | Every push, every PR, weekly Mon 07:00 UTC |
| **Dependency Audit** | `ppnpm audit --audit-level=moderate` on worker dependencies | On `pnpm-lock.yaml` changes, weekly Mon 06:00 UTC |
| **OpenSSF Scorecard** | Supply chain security posture across 18 checks | Every push to `main`, weekly Mon 06:00 UTC |

`Analyze (javascript)` and `pnpm audit` are required branch protection status checks — all pushes must pass both before merge.

### Smoke tests

Run manually against the live site after any worker deployment. Requires `GRAPH_PASSWORD` and `FLUSH_TOKEN` in `.env.local`.

```bash
make test          # run all smoke tests
make test-headers  # verify security response headers
make test-auth     # verify /graph/ and /api/logs auth gates (401 without, 200 with)
make test-flush    # verify /flush endpoint responds with {ok: true}
```

### Test update policy

All major changes to the Worker or graph code must include corresponding test coverage:

- **New input-processing functions** — add a jazzer.js fuzz target in `worker/fuzz/`
- **New API endpoints or auth paths** — add a `make test-*` smoke test and wire it into `make test`
- **Changes to existing fuzzed functions** — update the fuzz target and add corpus seeds for new code paths
- **Security-relevant changes** — verify CodeQL and Scorecard continue to pass with no new findings

Minor changes (documentation, styling, configuration) are exempt.

---

## Governance

### Code review

This project has a single human maintainer. The reviewer is AI and therefore does not satisfy the non-author human approval requirement (OSPS-QA-07.01). Compensating controls in place:

- All commits are GPG-signed by the maintainer
- Branch protection blocks force-push and branch deletion
- Required CI status checks (CodeQL, fuzzing, pnpm audit) must pass before merge
- gitleaks pre-commit hook scans every staged commit for secret exposure
