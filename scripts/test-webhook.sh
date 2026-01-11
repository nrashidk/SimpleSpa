#!/bin/bash

# Test WhatsApp webhook endpoint
# This simulates what Twilio sends to your server

echo "Testing WhatsApp webhook endpoint..."
echo ""

# Replace with your actual server URL
SERVER_URL="${1:-http://localhost:5000}"

echo "Server: $SERVER_URL"
echo ""

# Test payload (simulates incoming "Hi" message)
curl -X POST "$SERVER_URL/api/webhooks/whatsapp/inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM1234567890" \
  -d "AccountSid=AC1234567890" \
  -d "From=whatsapp:+1234567890" \
  -d "To=whatsapp:+14155238886" \
  -d "Body=Hi" \
  -d "NumMedia=0" \
  --verbose

echo ""
echo ""
echo "Check your server logs for:"
echo "  - Incoming POST /api/webhooks/whatsapp/inbound"
echo "  - 📱 [WhatsApp OUT] messages"
echo ""
