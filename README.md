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
