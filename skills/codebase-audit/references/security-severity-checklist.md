# Security Vulnerability Severity Classification Checklist

TSRC-style severity checklist for classifying security findings during codebase audits. Each vulnerability type is mapped to a severity tier with concrete technical conditions.

## Severity Mapping (TSRC → Audit)

| TSRC | Audit | Action |
|------|-------|--------|
| 严重 (Critical) | **Critical** | Immediate fix, individual batch |
| 高 (High) | **High** | Fix in current session, batch by type |
| 中 (Medium) | **Medium** | Fix if time allows |
| 低 (Low) | **Low** | Defer or batch |
| 无 (None) | **Ignore** | Record as informational, no action |

---

## CRITICAL (严重)

### C1 — Remote Code Execution / Command Injection

Check for any user-controlled input reaching system execution paths.

**Conditions (all must be met):**
- [ ] Vulnerability grants direct server OS / core product client permission access
- [ ] Falls into one of: remote arbitrary command execution, arbitrary code execution, SQL injection yielding system-level exec permissions, buffer overflow, root/elevated privilege escalation, cluster privilege escalation
- [ ] Exfiltrates server-level critical credentials (AK/SK/certificates/keys that can log into CVM)

**If any condition fails → downgrade to High.**

Checklist:
- [ ] `exec()`, `execSync()`, `spawn()` with unsanitized user input
- [ ] `eval()`, `new Function()`, `setTimeout(string)` with user input
- [ ] Template engine SSTI (`res.render()` with user data in template path)
- [ ] Shell command string interpolation in `child_process` calls
- [ ] SQL injection leading to `xp_cmdshell` or equivalent OS command execution
- [ ] Buffer overflow reachable from external input
- [ ] Deserialization of untrusted data (`JSON.parse` on unvalidated input, `eval`-based deserializers)

### C2 — Mass Information Leakage (Platform-Level)

Only for platform-scale systems (QQ, WeChat, Honor of Kings or equivalent).

**Conditions (all must be met):**
- [ ] Target is a platform/ecosystem-level product with >100M users
- [ ] Leaked information can compromise user identity security
- [ ] No significant barriers to exploitation

Checklist:
- [ ] Bulk user identity data accessible without authentication
- [ ] Database dump containing PII of large user base exposed
- [ ] API endpoint returns full user profiles without auth checks

### C3 — Severe Logic Flaws

**Conditions (meet one):**
- [ ] Allows impersonating arbitrary user identity and sending fully customizable messages to arbitrary recipients
- [ ] Enables credential changes for arbitrary accounts
- [ ] Mass identity forgery in chat/transaction scenarios — bulk impersonation with arbitrary content send

Checklist:
- [ ] OAuth token forgery allowing full message send as any user
- [ ] Password reset API without identity verification
- [ ] JWT authentication bypass (weak secret, `none` algorithm, expired token reuse)
- [ ] Session fixation allowing account takeover
- [ ] Chat/transaction API allows specifying arbitrary sender identity in messages

**Exclusion:** Popup/alert-only exploits that cannot specify readable content → downgraded.

### C4 — Direct Cash Drain

**Conditions (all must be met):**
- [ ] Directly withdrawable cash (not virtual goods/points)
- [ ] No utilization restrictions
- [ ] Impact amount > ¥100,000 (CNY)

Checklist:
- [ ] Payment logic bypass allowing direct cash extraction
- [ ] Balance manipulation that can be converted to cash
- [ ] Recharge/refund logic reversal

---

## HIGH (高)

### H1 — Stored XSS (High-Impact Products)

For QQ Zone, QQ Mail, Enterprise Mail, Web WeChat, WeChat Official Account products.

**Conditions:**
- [ ] Stored XSS with low-interaction propagation path affecting large user base
- [ ] Can be verified (use `console.log` — **not** blind, not page-destroying payloads)

Checklist:
- [ ] User-generated content rendered without sanitization (comments, profiles, signatures)
- [ ] Markdown/HTML/rich-text fields not sanitized on output
- [ ] File upload filenames reflected in HTML without encoding
- [ ] JSONP callback parameter not sanitized

**Note:** QQ Mail / Enterprise Mail (`*.mail.com`, `*.exmail.com`) sharing the same frontend template: only the first report of the same XSS path across multiple subdomains is valid.

### H2 — SQL Injection (Readable Data)

**Conditions:**
- [ ] Can read database table column names
- [ ] Can directly read user data (not just "first character of first row")

**Exclusion:** Only able to read first character of first column → unreliable, demoted.

Checklist:
- [ ] Unparameterized SQL queries with string interpolation
- [ ] Dynamic `ORDER BY` / `LIMIT` / `OFFSET` with user input
- [ ] Stored procedure calls with concatenated parameters
- [ ] ORM raw query methods with string formatting (e.g. `sequelize.query()`, `knex.raw()`)
- [ ] NoSQL injection in MongoDB `$where`, `$regex` with user input

### H3 — Unauthorized Admin Access

**Conditions:**
- [ ] Can access management console/admin panel without authorization
- [ ] Can perform management functions (not just read-only)

Rated based on: active user base (≥1000 users), feature criticality, user data sensitivity, product importance.

Checklist:
- [ ] Admin dashboard accessible without authentication
- [ ] Role/permission bypass (e.g. tampering role header/cookie)
- [ ] Direct object reference to admin API endpoints
- [ ] Missing authorization check on management APIs

### H4 — High-Risk Information Leakage

**Conditions (all must be met):**
- [ ] ≥3 distinct sensitive PII fields leaked (real name, ID number, address, phone, WeChat/QQ, bank card, full transaction records, medical info)
- [ ] Data volume exceeds threshold (scaled by business importance)

Checklist:
- [ ] API endpoint returns full user profile without field filtering
- [ ] Logging system stores PII in readable format
- [ ] Backup/S3 bucket with public read containing PII
- [ ] GraphQL introspection + unauthenticated query returning sensitive fields
- [ ] Debug endpoint exposing database records in production
- [ ] CSV/Excel download with unrestricted user data export

### H5 — Remote Client Code Execution

**Conditions:**
- [ ] Can execute arbitrary commands (prove with `ipconfig` or `id` output)
- [ ] Not limited to launching built-in system programs

Checklist:
- [ ] Browser use-after-free (UAF) in core product client
- [ ] Remote kernel code execution
- [ ] Electron/CEF `nodeIntegration: true` + `contextIsolation: false` + XSS
- [ ] Protocol handler injection in desktop clients
- [ ] Logic-error-based remote code execution

### H6 — SSRF With Response (Internal Network)

**Conditions:**
- [ ] Can target Tencent internal network (not just public endpoints)
- [ ] Response is returned to the attacker (not blind)
- [ ] Test domains: `http://tst.woa.com/flag.html` (domain), `http://9.138.237.216/flag.html` (IP)

**Scoring:**
- Full response returned → High 7 points
- Partial response (limited chars) → High 6 points
- Image-only response → Medium 4 points
- Blind/no response → Medium 3 points

Checklist:
- [ ] User-controlled URL fetched server-side without allowlist
- [ ] URL validation bypass using `@`, `#`, DNS rebinding, IPv6 variants
- [ ] Protocol smuggling (`file://`, `gopher://`, `dict://`)
- [ ] Cloud metadata service accessible via SSRF (169.254.169.254)
- [ ] Internal service discovery via response timing/error differences

### H7 — Privilege Escalation / IDOR (Core Features)

**Conditions (meet one):**
- [ ] Unauthorized access to another user's full account or all core functions
- [ ] Batch traversal of large user data (videos/images/live streams/CDN configs/models/training data)
- [ ] Zero-interaction mass group chat creation

Checklist:
- [ ] User ID/object ID in API parameters not validated for ownership
- [ ] Missing `user_id` check in database queries
- [ ] Auto-increment IDs used for sensitive resources without auth
- [ ] WebSocket messages processed without session validation
- [ ] Role/group membership assignment without authorization

### H8 — Resource Draining / Infinite Free Usage

**Conditions (meet one):**
- [ ] Unlimited free usage of large-scale core cloud resources
- [ ] Access to core production data
- [ ] Active exploit causing significant financial loss

Checklist:
- [ ] Pricing/billing logic bypass for major resources
- [ ] Coupon/discount logic not validated server-side
- [ ] Rate limiting missing on paid resource provisioning
- [ ] Subscription downgrade doesn't properly restrict access

### H9 — XSS in Core Client Products

- [ ] **Core** client product (desktop/mobile app handling sensitive data/logins)
- [ ] Can exfiltrate sensitive information or perform sensitive operations
- [ ] Rating: High 6 points; wormable → bonus upgrade

**Distinction:** This covers **core** client products. XSS in non-core client products that can still exfiltrate info → Medium (M2).

### H10 — Permanent Client DoS

- [ ] Core product client only
- [ ] Client rendered permanently unusable (requires reinstall)
- [ ] Not just crash/restart (temporary DoS → Medium)

### H11 — Virtual Goods Drain (>¥5000)

**Conditions (all must be met):**
- [ ] Single user can arbitrarily acquire/transfer virtual goods with cash value (memberships, points, in-game RMB items, no-limit coupons, free cloud servers)
- [ ] Impact value > ¥5000
- [ ] Outside business/product intended behavior

Checklist:
- [ ] Recharge/point balance manipulation
- [ ] In-game item duplication or theft
- [ ] Coupon/voucher unlimited generation
- [ ] Subscription benefit bypass allowing resource monopolization

### H12 — Arbitrary File Read/Write (Full Scope)

- [ ] COS/cloud storage arbitrary file read/write covering entire bucket
- [ ] File overwrite affecting the whole site

Checklist:
- [ ] File path traversal in download/read API
- [ ] File upload with insufficient path validation allowing overwrite
- [ ] COS bucket policy too permissive for server-side operations

---

## MEDIUM (中)

### M1 — Stored XSS (Requires Interaction)

- [ ] Stored XSS but requires user interaction (e.g., clicking a link) to trigger
- [ ] CSRF on important/sensitive operations

Checklist:
- [ ] Stored XSS in non-critical application (not platform-level)
- [ ] CSRF on password change, payment, or data export
- [ ] CSRF token missing or static
- [ ] CORS misconfiguration allowing credentialed cross-origin writes

### M2 — Remote DoS

- [ ] Remote application denial of service (no user interaction required)
- [ ] Kernel-level DoS
- [ ] Client XSS that can exfiltrate info or perform sensitive ops (non-core client product only; core client → H9)

**Exclusion:** Requires user interaction → Low.

Checklist:
- [ ] Unbounded resource consumption via API (large queries, expensive computations)
- [ ] Regex ReDoS with user-controllable input
- [ ] Infinite loop triggerable via malformed input
- [ ] Memory exhaustion via file upload or data payload

### M3 — Information Leakage (Moderate)

Checklist:
- [ ] Passwords stored in plaintext in client-side code
- [ ] QQ password transmitted in plaintext
- [ ] Source code archive containing sensitive config leaked
- [ ] `.env`, `.git`, `.svn`, `node_modules` exposed on production server
- [ ] `phpinfo()` or debug endpoints accessible in production
- [ ] Server error pages exposing full file paths and config

### M4 — Subdomain Takeover

- [ ] `*.qq.com` or `*.tencent.com` subdomain vulnerable to takeover

Checklist:
- [ ] DNS CNAME pointing to unclaimed cloud service (S3, Heroku, GitHub Pages, Azure)
- [ ] Expired cloud service still has DNS record pointing to it
- [ ] Third-party service (Statuspage, Zendesk, etc.) deprovisioned but CNAME remains
- [ ] Can verify via `dig CNAME <subdomain>` + check service availability

### M5 — OAuth Login/Binding Hijack (Click Required)

- [ ] User must click link; not zero-interaction

Checklist:
- [ ] OAuth `redirect_uri` not validated or insufficiently validated
- [ ] CSRF token in OAuth flow missing or static (login CSRF)
- [ ] OAuth `state` parameter not validated
- [ ] Account binding API without confirming current session ownership

### M6 — Blind SSRF

- [ ] Can reach Tencent internal network but no response returned
- [ ] Server executes request but response not observable

### M7 — Local Code Execution

**Conditions:**
- [ ] Locally exploitable (requires existing access to user machine)

Checklist:
- [ ] Stack/heap overflow in native code
- [ ] Use-after-free / double-free
- [ ] Format string vulnerability
- [ ] Local privilege escalation (user → Administrator/System, default client config)
- [ ] File association DLL hijacking
- [ ] Logic-error-based local code execution

**Exclusions (not valid):**
- Local DLL hijacking (no remote vector)
- Loading non-existent DLL
- Loading DLL without integrity check
- Requires admin privileges
- Requires extensive user interaction
- KnownDLLs-based hijacking

### M8 — Mini Program Key Leak (Limited Impact)

- [ ] WeChat Mini Program secret key leaked
- [ ] Cannot prove exploitation of high-impact APIs (send customer messages, Tencent Cloud API write operations)

**If exploitable for high-impact operations → upgrade to High.**

### M9 — Single-Function IDOR

- [ ] Non-core functionality, single API endpoint

### M10 — Non-Critical SQL Injection

- [ ] Non-core business database
- [ ] Leaks minimal or non-sensitive data

### M11 — Arbitrary File Read (Read-Only)

- [ ] Can read files but cannot write
- [ ] Or can manipulate non-sensitive files with no further exploitation path

### M12 — Test System Server Compromise

- [ ] Cannot reach production/internal Tencent network

**If cannot get server permissions → ignore.**

### M13 — JSONP Hijacking (Sensitive Data)

- [ ] Callback parameter can be manipulated
- [ ] Returns sensitive user data

Checklist:
- [ ] JSONP endpoint returns user PII without referer/csrf token
- [ ] Callback function name controllable allowing arbitrary function execution

### M14 — Local Database Injection

- [ ] SQLite / IndexedDB injection on client side
- [ ] Can cause info leak or other harm

### M15 — Feature Abuse / Discount Bypass

- [ ] Basic-tier user can access premium features via API
- [ ] Limited discounts repeatedly bypassed (but can only obtain specific non-core resources)
- [ ] Usage restrictions have bypassable conditions

**Downgrade if:** no real profit gained, limited-impact edge functionality.

---

## LOW (低)

### L1 — XSS (Obsolete Browser Only)

- [ ] Only works in specific non-mainstream or obsolete browsers (IE and older versions not accepted)

Checklist:
- [ ] Stored XSS in niche browser only
- [ ] Reflected XSS in niche browser only
- [ ] DOM clobbering requiring old browser

### L2 — Minor Information Leakage

Checklist:
- [ ] Non-sensitive source code leaked on GitHub
- [ ] SVN `.svn/entries` exposed
- [ ] `phpinfo()` without sensitive data
- [ ] `logcat` with non-sensitive information
- [ ] Valid internal network credentials leaked (but no access yet)

### L3 — URL Redirect / Open Redirect

- [ ] `qq.com`, `tencent.com`, `wechat.com` subdomains

**Proof requirement:**
- [ ] Must demonstrate redirect to `http://www.qq.com/521_qq_diao_yu_wangzhan_789.com`
- [ ] Direct redirect (no intermediate hops, no user warnings)
- Otherwise → not accepted as a vulnerability.

Checklist:
- [ ] `redirect_url`, `next`, `return_to` parameters not validated
- [ ] Referer-based redirect can be spoofed
- [ ] Meta-refresh with user-controlled URL
- [ ] `window.location` assignment with untrusted input

### L4 — Hard-to-Exploit Issues

Checklist:
- [ ] Reflected XSS with propagation/exploitation difficulty (mail XSS excluded)
- [ ] DOM-based XSS (not stored, not reflected)
- [ ] SQL injection in test system (hard to exploit)
- [ ] MITM-required RCE with valid PoC
- [ ] Client memory modification affecting single game skill/property

### L5 — Rate Limiting / Brute Force Defects

Checklist:
- [ ] SMS bombing bypass (single number receiving 50+ messages in 3 minutes)
- [ ] Account password brute-force without rate limiting
- [ ] OTP/TOTP no rate limiting or cooldown
- [ ] CAPTCHA bypass re-usable across requests

### L6 — Non-Security Bugs

- [ ] Page rendering issues
- [ ] Page unavailability
- [ ] Feature malfunction

---

## IGNORE / NON-ISSUE (无)

### N1 — Unusable "Vulnerabilities"

Checklist:
- [ ] Scanner-generated report without context (e.g., "Web Server version too low")
- [ ] Self-XSS (requires user to paste attacker's code themselves)
- [ ] JSON hijacking without sensitive data
- [ ] CSRF on non-sensitive operations (bookmarks, cart add, non-important order, profile edit)
- [ ] Meaningless source code leakage
- [ ] Meaningless concurrency issues
- [ ] IDOR with no impact on other users
- [ ] Internal IP address / domain leakage
- [ ] 401 basic auth phishing (not a vulnerability)
- [ ] Program path disclosure
- [ ] Non-sensitive logcat information

### N2 — Low-Risk / Hard-to-Exploit

Checklist:
- [ ] PDF XSS
- [ ] Email bombing
- [ ] Prank CSRF (single logout, Self-CSRF)
- [ ] DLL hijacking without remote exploitation path
- [ ] Username enumeration
- [ ] SPF email spoofing (without proof of delivery to spam folder)
- [ ] SSRF that cannot reach internal network
- [ ] API key leakage for non-critical resources
- [ ] Local DoS (crashes app locally on user's own machine)
- [ ] "Log4j2" with only DNSlog evidence (no actual exploitation demonstrated)

### N3 — No Evidence

- [ ] Self-claim ("my QQ was hacked therefore vulnerability")
- [ ] Cannot reproduce after multiple attempts with auditor

### N4 — Business-as-Design

- [ ] Expected business behavior within operational tolerance
- [ ] Cannot cause financial loss
- [ ] Multiple accounts claiming small rewards as intended business activity

### N5 — Out of Scope

- [ ] Not a Tencent business vulnerability
- [ ] Not a bug in Tencent product itself

### N6 — Under Active Remediation

- [ ] System currently in penetration testing /专项排查
- [ ] Check TSRC暂停收录列表 first

### N7 — Intended RCE

- [ ] Product-expected code execution (e.g., sandbox, REPL, code runner tools)
- [ ] Container/test environment controllable execution

---

## Quick Reference: Severity Decision Tree

```
Is it exploitable without user interaction?
├── YES
│   ├── Remote code/command execution?
│   │   ├── Server permission gained + credentials exfiltrated? → CRITICAL
│   │   └── Server permission gained (no credential exfil)? → HIGH
│   ├── Data exfiltration?
│   │   ├── Platform-level + user identity info? → CRITICAL
│   │   ├── ≥3 PII fields + significant volume? → HIGH
│   │   └── Minor/non-sensitive data? → MEDIUM or LOW
│   ├── Bypass auth/privilege?
│   │   ├── Full account takeover, mass traversal? → HIGH
│   │   └── Single endpoint, non-core? → MEDIUM
│   ├── Direct cash drain?
│   │   ├── >¥100K? → CRITICAL
│   │   ├── >¥5000 virtual goods? → HIGH
│   │   └── <¥5000 or non-cash? → MEDIUM
│   └── DoS?
│       ├── Permanent, core client? → HIGH
│       └── Remote DoS (no interaction)? → MEDIUM
├── NO (requires interaction)
│   ├── Stored XSS (click required)? → MEDIUM
│   ├── CSRF on sensitive operation? → MEDIUM
│   ├── Click + OAuth hijack? → MEDIUM
│   └── XSS in obsolete browser only? → LOW
└── NOT EXPLOITABLE / NO IMPACT → IGNORE
```

## Usage in Codebase Audit

When reviewing source code:

1. **Identify** the vulnerability pattern from the checklists above
2. **Classify** the severity using the conditions and decision tree
3. **Record** the TSRC grade as an annotation (e.g., `[TSRC: HIGH]`) alongside the audit severity
4. **Assign** the mapped audit severity for the fix batch priority

For findings where conditions are ambiguous, default to the lower severity and note the uncertainty.
