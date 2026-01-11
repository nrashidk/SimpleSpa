# Twilio Webhook Configuration

## For WhatsApp Sandbox (Testing)

1. Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox

2. Under **"Sandbox Configuration"**, find **"When a message comes in"**

3. Set:
   - **URL**: `https://your-replit-app-url.repl.co/api/webhooks/whatsapp/inbound`
   - **Method**: `POST`

4. Click **Save**

---

## For Production WhatsApp Number

Once you have an approved WhatsApp Business number:

1. Go to: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders

2. Click on your WhatsApp sender

3. Under **"Messaging"**, set:
   - **When a message comes in**: `https://your-domain.com/api/webhooks/whatsapp/inbound`
   - **Method**: `POST`

4. Click **Save**

---

## Important Notes

- Replace `your-replit-app-url.repl.co` with your actual Replit app URL
- The webhook must be publicly accessible
- Twilio will verify the webhook by making a test request
- Make sure your server is running when you save the webhook URL
