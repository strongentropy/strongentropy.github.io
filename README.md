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
