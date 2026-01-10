# Production Login Troubleshooting Guide
**Domain:** lookforspa.com
**User:** retro_lounge@hotmail.com
**Issue:** Unable to login as super admin or spa admin

---

## 🔍 Root Cause Analysis

Your SimpleSpa application has **two separate authentication methods**:

1. **OIDC (OpenID Connect)** - Replit Auth for `/api/login` → redirects to Replit
2. **Email/Password** - Direct login via `/api/admin/login` → password-based

The login issues are likely caused by one or more of the following:

---

## 🚨 Critical Configuration Issues

### Issue 1: Missing REPL_ID Environment Variable
**Severity:** CRITICAL (blocks OIDC login)

**Problem:**
```typescript
// server/replitAuth.ts:20
return await client.discovery(
  new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
  process.env.REPL_ID! // ❌ This must be set for OIDC to work
);
```

**Symptoms:**
- OIDC login redirects fail
- Error: "Environment variable REPL_ID not provided"
- `/api/login` returns 500 error

**Solution:**
```bash
# Add to production environment variables
REPL_ID=your-replit-app-client-id
ISSUER_URL=https://replit.com/oidc
```

**How to get REPL_ID:**
- Go to your Replit deployment settings
- Find OAuth/OIDC Client ID
- Copy the client ID value

---

### Issue 2: HTTPS Required for Secure Cookies
**Severity:** CRITICAL (blocks all logins)

**Problem:**
```typescript
// server/replitAuth.ts:42
cookie: {
  httpOnly: true,
  secure: true,  // ❌ Requires HTTPS - fails on HTTP
  maxAge: sessionTtl,
}
```

**Symptoms:**
- Login appears successful but session cookie not set
- Immediately redirected back to login page
- Browser console shows "Cookie blocked due to secure flag"

**Verification:**
1. Visit https://lookforspa.com (note the 's' in https)
2. Check if site loads with valid SSL certificate
3. Look for browser warnings about "Not Secure"

**Solutions:**

**Option A: Ensure HTTPS is enabled** (RECOMMENDED)
```bash
# Verify SSL certificate is installed
curl -I https://lookforspa.com

# Should return:
# HTTP/2 200
# strict-transport-security: ...
```

**Option B: Disable secure cookies for HTTP (NOT RECOMMENDED - INSECURE)**
```typescript
// server/replitAuth.ts:42
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false',
  maxAge: sessionTtl,
}
```

Then set `FORCE_HTTPS=false` in environment variables (only for testing).

---

### Issue 3: Missing sameSite Cookie Attribute
**Severity:** HIGH (causes login failures)

**Problem:**
```typescript
// server/replitAuth.ts:40-44
cookie: {
  httpOnly: true,
  secure: true,
  maxAge: sessionTtl,
  // ❌ MISSING: sameSite attribute
}
```

**Symptoms:**
- Login works but session not persisted across page loads
- CORS errors in browser console
- "Cross-site cookie blocked" warnings

**Temporary Fix:**
Add `sameSite: 'lax'` to cookie configuration (see Issue #5 in security review).

---

### Issue 4: CORS Not Configured
**Severity:** HIGH (blocks API calls from frontend)

**Problem:**
```typescript
// server/index.ts - NO CORS MIDDLEWARE
const app = express();
app.use(express.json());
// ❌ Missing: app.use(cors({ origin: ... }))
```

**Symptoms:**
- API calls from frontend fail with CORS errors
- Browser console: "Access-Control-Allow-Origin header missing"
- Login POST request blocked by browser

**Solution:**
```bash
# Add to environment variables
CORS_ORIGIN=https://lookforspa.com

# Or for multiple domains:
CORS_ORIGIN=https://lookforspa.com,https://www.lookforspa.com
```

Then add CORS middleware in `server/index.ts` (see security review for implementation).

---

### Issue 5: Database User Configuration Issues
**Severity:** CRITICAL (blocks password-based login)

**Problem:**
The user `retro_lounge@hotmail.com` must meet ALL these conditions:

```typescript
// server/routes.ts:291-321
// 1. User must exist in database
const user = await storage.getUserByEmail(email);

// 2. User must have admin or super_admin role
if (user.role !== 'admin' && user.role !== 'super_admin') {
  return res.status(403).json({ message: "Access denied" });
}

// 3. User must be approved
if (user.status !== 'approved') {
  return res.status(403).json({ message: "Your account is pending approval" });
}

// 4. User must have a password set
if (!user.password) {
  return res.status(401).json({ message: "Invalid credentials" });
}
```

**Verification Steps:**
Connect to production database and check:

```sql
-- Check if user exists
SELECT id, email, role, status, password IS NOT NULL as has_password, "adminSpaId"
FROM users
WHERE LOWER(email) = 'retro_lounge@hotmail.com';

-- Expected result:
-- email: retro_lounge@hotmail.com
-- role: super_admin (or admin)
-- status: approved
-- has_password: true
-- adminSpaId: <number> (if admin role)
```

**Common Issues:**

**Issue 5a: User doesn't exist**
```sql
-- Create super admin user
INSERT INTO users (email, password, role, status)
VALUES (
  'retro_lounge@hotmail.com',
  '$2a$10$...', -- bcrypt hash of password
  'super_admin',
  'approved'
);
```

**To generate password hash:**
```bash
# Use bcrypt with 10 rounds
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123', 10, (e,h) => console.log(h));"
```

**Issue 5b: User exists but role is wrong**
```sql
UPDATE users
SET role = 'super_admin', status = 'approved'
WHERE LOWER(email) = 'retro_lounge@hotmail.com';
```

**Issue 5c: User has no password (OIDC-only user)**
```sql
-- Add password to existing OIDC user
UPDATE users
SET password = '$2a$10$...' -- bcrypt hash
WHERE LOWER(email) = 'retro_lounge@hotmail.com';
```

---

## 🔧 Diagnostic Commands

### Check Production Environment Variables
```bash
# SSH into production server and check:
echo $REPLIT_DOMAINS
# Expected: lookforspa.com (or multiple domains separated by commas)

echo $REPL_ID
# Expected: <your-replit-client-id>

echo $DATABASE_URL
# Should show PostgreSQL connection string

echo $SESSION_SECRET
# Should show secret key (at least 32 characters)

echo $NODE_ENV
# Expected: production
```

### Check Database Connectivity
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check sessions table exists
psql $DATABASE_URL -c "\dt sessions"

# Check users table
psql $DATABASE_URL -c "SELECT email, role, status FROM users LIMIT 5;"
```

### Check Server Logs
```bash
# Watch logs in real-time
tail -f /var/log/your-app/output.log

# Look for these patterns during login attempt:
# ✅ Good:
"Admin login attempt: { email: 'retro_lounge@hotmail.com', hasPassword: true }"
"Login successful, session created for: retro_lounge@hotmail.com"

# ❌ Bad:
"User not found: retro_lounge@hotmail.com"
"User is not admin: { email: 'retro_lounge@hotmail.com', role: 'customer' }"
"User not approved: { email: 'retro_lounge@hotmail.com', status: 'pending' }"
"User has no password set: retro_lounge@hotmail.com"
"Password mismatch for user: retro_lounge@hotmail.com"
```

### Test Login Endpoint Directly
```bash
# Test login endpoint with curl
curl -X POST https://lookforspa.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"retro_lounge@hotmail.com","password":"YourPassword"}' \
  -c cookies.txt -v

# Check response:
# ✅ Success: {"success":true,"user":{...}}
# ❌ 401: {"message":"Invalid credentials"}
# ❌ 403: {"message":"Access denied. Admin access required."}
# ❌ 403: {"message":"Your account is pending approval"}
```

### Check Browser DevTools
Open browser DevTools (F12) and check:

**Console tab:**
- Look for CORS errors
- Look for network request failures

**Network tab:**
- Click on `/api/admin/login` request
- Check "Preview" tab for error response
- Check "Headers" tab → "Set-Cookie" to verify cookie was set

**Application tab:**
- Cookies → https://lookforspa.com
- Verify `connect.sid` cookie exists
- Check cookie has `Secure`, `HttpOnly` flags

---

## 📋 Step-by-Step Fix Checklist

### Phase 1: Environment Configuration (5 minutes)
- [ ] Add `REPL_ID` to production environment variables
- [ ] Add `REPLIT_DOMAINS=lookforspa.com` (verify no typos)
- [ ] Verify `SESSION_SECRET` is set (min 32 chars)
- [ ] Verify `DATABASE_URL` is correct
- [ ] Set `NODE_ENV=production`
- [ ] Restart application server

### Phase 2: Database User Setup (5 minutes)
- [ ] Connect to production PostgreSQL database
- [ ] Run query to check if `retro_lounge@hotmail.com` exists
- [ ] If missing, create user with super_admin role
- [ ] If exists, verify role is `super_admin` and status is `approved`
- [ ] Verify user has password set (or set new password)
- [ ] Test query: `SELECT * FROM users WHERE email = 'retro_lounge@hotmail.com';`

### Phase 3: HTTPS/SSL Verification (2 minutes)
- [ ] Visit `https://lookforspa.com` (not http)
- [ ] Verify browser shows padlock icon (secure connection)
- [ ] Check certificate is valid (not expired)
- [ ] If HTTP only, install SSL certificate (Let's Encrypt free option)

### Phase 4: Application Code Fixes (10 minutes)
**Note:** These require code changes but are critical:

- [ ] Add CORS middleware (see security review)
- [ ] Add `sameSite: 'lax'` to cookie config
- [ ] Add Helmet middleware for security headers
- [ ] Deploy updated code

### Phase 5: Testing (5 minutes)
- [ ] Clear browser cookies
- [ ] Visit `https://lookforspa.com/admin-login`
- [ ] Enter email: `retro_lounge@hotmail.com`
- [ ] Enter password
- [ ] Click "Sign In"
- [ ] Check browser console for errors
- [ ] Verify redirect to `/admin` dashboard

---

## 🎯 Quick Fix Priority

**If you need immediate access, try these in order:**

### 1. Verify HTTPS (1 minute)
```bash
# Check if site is accessible via HTTPS
curl -I https://lookforspa.com

# If this fails, SSL is the issue
```

### 2. Create Super Admin via Database (2 minutes)
```sql
-- Connect to production database
\c your_database_name

-- Check if user exists
SELECT email, role, status, password FROM users WHERE email = 'retro_lounge@hotmail.com';

-- If user doesn't exist, create it:
INSERT INTO users (id, email, password, role, status, "createdAt", "updatedAt")
VALUES (
  'retro-lounge-super-admin', -- unique ID
  'retro_lounge@hotmail.com',
  '$2a$10$XYZ...', -- Replace with actual bcrypt hash of your password
  'super_admin',
  'approved',
  NOW(),
  NOW()
);

-- If user exists but wrong role:
UPDATE users
SET role = 'super_admin', status = 'approved'
WHERE email = 'retro_lounge@hotmail.com';
```

### 3. Test Login with curl (1 minute)
```bash
curl -X POST https://lookforspa.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"retro_lounge@hotmail.com","password":"YOUR_PASSWORD"}' \
  -v

# This will show the exact error message
```

### 4. Check Server Logs (1 minute)
```bash
# Look for login attempt logs
grep "Admin login attempt" /path/to/logs/latest.log
grep "Login successful" /path/to/logs/latest.log
grep "User not found" /path/to/logs/latest.log
```

---

## 🛠️ Common Error Messages & Solutions

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "Invalid credentials" | Wrong password OR user has no password | Check password hash in database |
| "Access denied. Admin access required." | User role is 'customer' not 'admin'/'super_admin' | Update user role in database |
| "Your account is pending approval" | User status is 'pending' not 'approved' | Update user status to 'approved' |
| "Unauthorized" (401 on /api/user) | Session cookie not set/sent | Check HTTPS, sameSite, CORS |
| CORS error in browser console | No CORS middleware configured | Add CORS middleware (see Issue #4) |
| Cookie blocked (browser warning) | secure: true but site is HTTP | Enable HTTPS or disable secure flag |
| 500 Internal Server Error | Database connection OR missing env vars | Check DATABASE_URL, check server logs |
| "User not found" | Email doesn't exist in users table | Create user in database |

---

## 🔐 Security Notes

**IMPORTANT:** The security review identified that:

1. `/api/dev/create-super-admin` endpoint is **EXPOSED IN PRODUCTION**
   - This is a CRITICAL security risk
   - Anyone can create super admin accounts
   - **DISABLE THIS IMMEDIATELY** (add `NODE_ENV` check)

2. No rate limiting on `/api/admin/login`
   - Vulnerable to brute force attacks
   - **ADD RATE LIMITING** (5 attempts per 15 min)

3. Cookie security issues
   - Missing `sameSite` attribute
   - No CSRF protection

**These should be fixed ASAP after getting login working.**

---

## 📞 Still Not Working?

If login still fails after all checks:

1. **Check the exact error message:**
   - Browser console (F12)
   - Network tab → `/api/admin/login` → Preview
   - Server logs

2. **Verify the authentication flow:**
   ```
   User submits form
   → POST /api/admin/login
   → Checks user exists
   → Checks role (admin/super_admin)
   → Checks status (approved)
   → Checks password match
   → Creates session
   → Sets cookie
   → Returns success
   ```

   Find where this flow breaks.

3. **Enable verbose logging:**
   - Add more console.log statements in `server/routes.ts:279-342`
   - Check what exact condition is failing

4. **Test locally first:**
   - Set up local environment with same database
   - Test login on localhost
   - If it works locally but not in prod → environment issue

---

## 🚀 Production Deployment Checklist

Before going live, ensure:

- [ ] HTTPS/SSL certificate installed and valid
- [ ] All environment variables set correctly
- [ ] Database migrations applied
- [ ] Sessions table exists
- [ ] Super admin user created with approved status
- [ ] CORS configured for production domain
- [ ] Rate limiting enabled
- [ ] Helmet middleware applied
- [ ] Development endpoints disabled (NODE_ENV check)
- [ ] Cookie security configured (sameSite, secure)

---

## Summary

**Most Likely Causes (in order of probability):**

1. **HTTPS not enabled** - Secure cookies require HTTPS
2. **User doesn't exist or wrong role/status** - Check database
3. **Missing environment variables** - REPL_ID, REPLIT_DOMAINS
4. **CORS not configured** - Blocks API requests
5. **Session cookie issues** - sameSite, secure flag problems

**Recommended Action Plan:**
1. Verify HTTPS works (1 min)
2. Check/create database user (2 min)
3. Test login with curl to see exact error (1 min)
4. Fix identified issue from error message
5. Apply security fixes from review (30 min)

**Need the password hash for database insert?**
Run this command to generate bcrypt hash:
```bash
node -e "require('bcryptjs').hash('YourPassword', 10, (e,h) => console.log(h));"
```
