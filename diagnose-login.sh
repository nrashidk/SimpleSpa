#!/bin/bash
#
# SimpleSpa Login Diagnostic Script
# Checks production environment and identifies login issues
#
# Usage: ./diagnose-login.sh [domain] [email]
# Example: ./diagnose-login.sh lookforspa.com retro_lounge@hotmail.com
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${1:-lookforspa.com}"
TEST_EMAIL="${2:-retro_lounge@hotmail.com}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   SimpleSpa Login Diagnostics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Domain: $DOMAIN"
echo "Test Email: $TEST_EMAIL"
echo ""

# Counter for issues found
ISSUES=0

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "ok" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "warn" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
        ((ISSUES++))
    elif [ "$status" = "error" ]; then
        echo -e "${RED}✗${NC} $message"
        ((ISSUES++))
    else
        echo -e "${BLUE}ℹ${NC} $message"
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. HTTPS / SSL Certificate Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if domain is reachable via HTTPS
if curl -k -I -s "https://$DOMAIN" > /dev/null 2>&1; then
    print_status "ok" "HTTPS connection successful"

    # Check SSL certificate validity
    if openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" < /dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
        print_status "ok" "SSL certificate is valid"
    else
        print_status "error" "SSL certificate is invalid or self-signed"
        echo "          This will cause 'secure: true' cookies to fail"
    fi
else
    print_status "error" "Cannot connect via HTTPS"
    echo "          Secure cookies require HTTPS - login will fail"

    # Try HTTP
    if curl -I -s "http://$DOMAIN" > /dev/null 2>&1; then
        print_status "warn" "HTTP connection works (but secure cookies won't)"
    else
        print_status "error" "Domain is not reachable at all"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Environment Variables Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check required environment variables
check_env() {
    local var_name=$1
    local required=$2

    if [ -n "${!var_name}" ]; then
        print_status "ok" "$var_name is set"
        if [ "$var_name" != "DATABASE_URL" ] && [ "$var_name" != "SESSION_SECRET" ]; then
            echo "          Value: ${!var_name}"
        fi
    else
        if [ "$required" = "true" ]; then
            print_status "error" "$var_name is NOT set (required)"
        else
            print_status "warn" "$var_name is NOT set (optional)"
        fi
    fi
}

check_env "DATABASE_URL" "true"
check_env "SESSION_SECRET" "true"
check_env "REPLIT_DOMAINS" "true"
check_env "REPL_ID" "true"
check_env "NODE_ENV" "true"
check_env "PORT" "false"

# Validate REPLIT_DOMAINS contains our domain
if [ -n "$REPLIT_DOMAINS" ]; then
    if echo "$REPLIT_DOMAINS" | grep -q "$DOMAIN"; then
        print_status "ok" "REPLIT_DOMAINS includes $DOMAIN"
    else
        print_status "error" "REPLIT_DOMAINS does not include $DOMAIN"
        echo "          Current value: $REPLIT_DOMAINS"
        echo "          Expected to contain: $DOMAIN"
    fi
fi

# Validate SESSION_SECRET length
if [ -n "$SESSION_SECRET" ]; then
    SECRET_LEN=${#SESSION_SECRET}
    if [ $SECRET_LEN -ge 32 ]; then
        print_status "ok" "SESSION_SECRET length is sufficient ($SECRET_LEN chars)"
    else
        print_status "error" "SESSION_SECRET is too short ($SECRET_LEN chars, need 32+)"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Database Connectivity Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$DATABASE_URL" ]; then
    if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
        print_status "ok" "Database connection successful"

        # Check if sessions table exists
        if psql "$DATABASE_URL" -c "\dt sessions" | grep -q "sessions"; then
            print_status "ok" "Sessions table exists"
        else
            print_status "error" "Sessions table is missing"
            echo "          Run migrations: npm run db:push"
        fi

        # Check if users table exists
        if psql "$DATABASE_URL" -c "\dt users" | grep -q "users"; then
            print_status "ok" "Users table exists"

            # Check if test user exists
            USER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER('$TEST_EMAIL');")
            if [ "$USER_COUNT" -gt 0 ]; then
                print_status "ok" "User $TEST_EMAIL exists in database"

                # Get user details
                USER_DETAILS=$(psql "$DATABASE_URL" -t -c "SELECT role, status, CASE WHEN password IS NOT NULL THEN 'YES' ELSE 'NO' END FROM users WHERE LOWER(email) = LOWER('$TEST_EMAIL');")
                ROLE=$(echo $USER_DETAILS | awk '{print $1}')
                STATUS=$(echo $USER_DETAILS | awk '{print $2}')
                HAS_PASSWORD=$(echo $USER_DETAILS | awk '{print $3}')

                echo "          Role: $ROLE"
                echo "          Status: $STATUS"
                echo "          Has Password: $HAS_PASSWORD"

                # Validate role
                if [ "$ROLE" = "super_admin" ] || [ "$ROLE" = "admin" ]; then
                    print_status "ok" "User role is valid ($ROLE)"
                else
                    print_status "error" "User role is invalid ($ROLE) - must be 'admin' or 'super_admin'"
                fi

                # Validate status
                if [ "$STATUS" = "approved" ]; then
                    print_status "ok" "User status is approved"
                else
                    print_status "error" "User status is $STATUS - must be 'approved'"
                fi

                # Validate password
                if [ "$HAS_PASSWORD" = "YES" ]; then
                    print_status "ok" "User has password set"
                else
                    print_status "error" "User has no password - cannot use email/password login"
                fi
            else
                print_status "error" "User $TEST_EMAIL does not exist in database"
                echo "          Run: node generate-password-hash.js"
                echo "          Then: psql \$DATABASE_URL -f create-super-admin.sql"
            fi
        else
            print_status "error" "Users table is missing"
            echo "          Run migrations: npm run db:push"
        fi
    else
        print_status "error" "Cannot connect to database"
        echo "          Check DATABASE_URL is correct"
    fi
else
    print_status "error" "DATABASE_URL not set - skipping database checks"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. API Endpoint Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test login endpoint (without credentials - just check if reachable)
if curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/auth/user" | grep -q "401"; then
    print_status "ok" "API endpoint is reachable (returns 401 as expected)"
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/auth/user")
    print_status "warn" "API endpoint returned unexpected status: $HTTP_CODE"
fi

# Test CORS headers
CORS_HEADER=$(curl -s -I -H "Origin: https://$DOMAIN" "https://$DOMAIN/api/auth/user" | grep -i "access-control-allow-origin" || echo "")
if [ -n "$CORS_HEADER" ]; then
    print_status "ok" "CORS headers present: $CORS_HEADER"
else
    print_status "warn" "CORS headers not found - may cause issues"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Security Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if /api/dev/create-super-admin is accessible (CRITICAL VULNERABILITY)
DEV_ENDPOINT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://$DOMAIN/api/dev/create-super-admin" -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test"}')
if [ "$DEV_ENDPOINT_STATUS" = "404" ] || [ "$DEV_ENDPOINT_STATUS" = "403" ]; then
    print_status "ok" "Dev endpoint is protected (HTTP $DEV_ENDPOINT_STATUS)"
else
    print_status "error" "CRITICAL: Dev endpoint /api/dev/create-super-admin is accessible!"
    echo "          This allows anyone to create super admin accounts"
    echo "          FIX IMMEDIATELY: Add NODE_ENV check or remove endpoint"
fi

# Check if rate limiting is enabled
echo "Testing rate limiting (sending 3 quick requests)..."
for i in {1..3}; do
    curl -s -o /dev/null "https://$DOMAIN/api/auth/user" &
done
wait

RATE_LIMIT_HEADER=$(curl -s -I "https://$DOMAIN/api/auth/user" | grep -i "x-ratelimit" || echo "")
if [ -n "$RATE_LIMIT_HEADER" ]; then
    print_status "ok" "Rate limiting headers detected"
else
    print_status "warn" "No rate limiting headers - brute force attacks possible"
fi

# Check security headers
SECURITY_HEADERS=$(curl -s -I "https://$DOMAIN" | grep -iE "x-frame-options|x-content-type-options|strict-transport-security" || echo "")
if [ -n "$SECURITY_HEADERS" ]; then
    print_status "ok" "Security headers present (Helmet)"
else
    print_status "warn" "Security headers missing - Helmet not configured"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ISSUES -eq 0 ]; then
    print_status "ok" "All checks passed! Login should work."
else
    print_status "error" "Found $ISSUES issue(s) that may prevent login"
    echo ""
    echo "Review the errors above and consult LOGIN_TROUBLESHOOTING.md"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $ISSUES
