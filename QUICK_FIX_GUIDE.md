# Quick Fix Guide - Production Login Issues

**Problem:** Cannot login at lookforspa.com with retro_lounge@hotmail.com

---

## 🚀 Quick Solutions (Try in Order)

### Solution 1: Create Super Admin User (2 minutes)

```bash
# Step 1: Generate password hash
node generate-password-hash.js "YourPasswordHere"

# Step 2: Copy the hash output, then edit create-super-admin.sql
# Replace 'REPLACE_WITH_PASSWORD_HASH' with the hash you just generated

# Step 3: Run the SQL script
psql $DATABASE_URL -f create-super-admin.sql

# Step 4: Verify user was created
psql $DATABASE_URL -c "SELECT email, role, status FROM users WHERE email = 'retro_lounge@hotmail.com';"

# Expected output:
#        email              |    role     | status
# -------------------------|-------------|----------
# retro_lounge@hotmail.com | super_admin | approved
```

---

### Solution 2: Quick Database Fix (1 minute)

If user exists but has wrong configuration:

```sql
-- Connect to database
psql $DATABASE_URL

-- Update user to super admin with approved status
UPDATE users
SET role = 'super_admin',
    status = 'approved'
WHERE LOWER(email) = 'retro_lounge@hotmail.com';

-- Check if user has password
SELECT email, role, status,
       CASE WHEN password IS NOT NULL THEN 'YES' ELSE 'NO' END as has_password
FROM users
WHERE email = 'retro_lounge@hotmail.com';

-- If has_password is 'NO', set a password:
-- First generate hash: node generate-password-hash.js "YourPassword"
-- Then:
UPDATE users
SET password = 'PASTE_BCRYPT_HASH_HERE'
WHERE email = 'retro_lounge@hotmail.com';
```

---

### Solution 3: Check Environment Variables (1 minute)

```bash
# Run diagnostic script
./diagnose-login.sh lookforspa.com retro_lounge@hotmail.com

# Or manually check:
echo "REPLIT_DOMAINS: $REPLIT_DOMAINS"
echo "REPL_ID: $REPL_ID"
echo "DATABASE_URL: $DATABASE_URL"
echo "SESSION_SECRET: ${SESSION_SECRET:0:10}..." # Show first 10 chars only

# If any are missing, set them:
export REPLIT_DOMAINS="lookforspa.com"
export REPL_ID="your-replit-client-id"
export SESSION_SECRET="your-32-character-secret-key"

# Then restart the app
```

---

### Solution 4: Test HTTPS (30 seconds)

```bash
# Check if HTTPS works
curl -I https://lookforspa.com

# Should see:
# HTTP/2 200
# (not HTTP/1.1 301 or errors)

# If HTTPS fails, check:
# 1. SSL certificate installed?
# 2. DNS pointing to correct server?
# 3. Firewall allowing port 443?
```

---

### Solution 5: Test Login Directly (30 seconds)

```bash
# Test login endpoint with curl
curl -X POST https://lookforspa.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"retro_lounge@hotmail.com","password":"YourPassword"}' \
  -c cookies.txt -v

# Successful response:
# {"success":true,"user":{...}}

# Error responses tell you what's wrong:
# {"message":"Invalid credentials"} → Wrong password or no password set
# {"message":"Access denied..."} → Wrong role (not admin/super_admin)
# {"message":"...pending approval"} → Status not approved
```

---

## 🎯 Most Common Issues & Fixes

| Error/Symptom | Cause | Quick Fix |
|---------------|-------|-----------|
| "Invalid credentials" | Password wrong or not set | Run Solution 1 to set password |
| "Access denied" | User role is 'customer' | Run Solution 2 to change role |
| "Pending approval" | Status is 'pending' | Run Solution 2 to approve |
| Page loads then immediately back to login | Cookie not being set | Check HTTPS works (Solution 4) |
| CORS error in browser | Missing CORS headers | Set CORS_ORIGIN env var |
| 500 error | Database or env var issue | Run diagnostic (Solution 3) |
| "User not found" | Email doesn't exist | Run Solution 1 to create user |

---

## 📋 Checklist

Before contacting support, verify:

- [ ] HTTPS works (visit https://lookforspa.com and see padlock)
- [ ] User exists in database
- [ ] User has role 'super_admin' or 'admin'
- [ ] User has status 'approved'
- [ ] User has password set (not null)
- [ ] Environment variables are set (REPL_ID, REPLIT_DOMAINS, etc.)
- [ ] Database is accessible
- [ ] Password you're entering is correct

---

## 🔧 Useful Commands

```bash
# Check if user exists
psql $DATABASE_URL -c "SELECT * FROM users WHERE email = 'retro_lounge@hotmail.com';"

# List all admin users
psql $DATABASE_URL -c "SELECT email, role, status FROM users WHERE role IN ('admin', 'super_admin');"

# Count sessions (should be > 0 after successful login)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM sessions;"

# View application logs
tail -f /var/log/your-app/output.log | grep -i "login"

# Test database connection
psql $DATABASE_URL -c "SELECT version();"
```

---

## 🆘 Still Stuck?

1. **Run the diagnostic script:**
   ```bash
   ./diagnose-login.sh lookforspa.com retro_lounge@hotmail.com
   ```

2. **Check exact error message:**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Try to login
   - Click on `/api/admin/login` request
   - Check "Preview" tab for error message

3. **Check server logs:**
   ```bash
   # Look for these specific log messages
   grep "Admin login attempt" /path/to/logs/latest.log
   grep "Login successful" /path/to/logs/latest.log
   grep "User not found" /path/to/logs/latest.log
   ```

4. **See full documentation:**
   - Read `LOGIN_TROUBLESHOOTING.md` for detailed explanations
   - Read `SECURITY_ARCHITECTURE_REVIEW.md` for security context

---

## 💡 Pro Tips

- **Password strength:** Use at least 12 characters with mixed case, numbers, symbols
- **Testing:** Always test on HTTPS, never HTTP in production
- **Security:** After fixing login, implement the security fixes from SECURITY_ARCHITECTURE_REVIEW.md
- **Backup:** Before modifying database, backup users table:
  ```bash
  psql $DATABASE_URL -c "COPY users TO '/tmp/users_backup.csv' CSV HEADER;"
  ```

---

## Generated Files Reference

| File | Purpose |
|------|---------|
| `generate-password-hash.js` | Create bcrypt hashes for passwords |
| `create-super-admin.sql` | SQL script to create/update super admin |
| `diagnose-login.sh` | Automated diagnostic checker |
| `LOGIN_TROUBLESHOOTING.md` | Detailed troubleshooting guide |
| `QUICK_FIX_GUIDE.md` | This file - quick reference |
| `SECURITY_ARCHITECTURE_REVIEW.md` | Full security audit |

---

**Last Updated:** 2026-01-10
**For SimpleSpa Production Deployment**
