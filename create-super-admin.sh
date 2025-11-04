#!/bin/bash

# Script to create a super admin user with email and password
# Usage: ./create-super-admin.sh [email] [password] [server_url]

EMAIL="${1:-nrashidk@gmail.com}"
PASSWORD="${2:-YourSecurePassword123}"
SERVER_URL="${3:-http://localhost:5000}"

echo "Creating super admin..."
echo "Email: $EMAIL"
echo "Server: $SERVER_URL"
echo ""

response=$(curl -s -X POST "$SERVER_URL/api/dev/create-super-admin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

echo "Response:"
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

if echo "$response" | grep -q "success.*true"; then
  echo "✓ Super admin created successfully!"
  echo ""
  echo "You can now login at: $SERVER_URL/admin/login"
  echo "Email: $EMAIL"
  echo "Password: [the password you provided]"
else
  echo "✗ Failed to create super admin. Check the error message above."
fi
