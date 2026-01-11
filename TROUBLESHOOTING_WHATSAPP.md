# 🔧 WhatsApp Not Responding - Troubleshooting Guide

## Problem: Sent message but no reply from bot

### ⚡ **Quick Diagnostic (Run This First)**

```bash
npx tsx scripts/diagnose-whatsapp.ts
```

This will check if credentials are properly configured.

---

## 🔍 **Step-by-Step Diagnosis**

### **Step 1: Check Server Initialization**

**Look at your server logs** when you started `npm run dev`.

#### ✅ **Good (Service Initialized):**
```
serving on port 5000
[Scheduler] Starting appointment scheduler...
✅ WhatsApp service initialized { spaId: 1, fromPhone: '+14155238886' }
```

#### ❌ **Bad (DEV MODE):**
```
serving on port 5000
[Scheduler] Starting appointment scheduler...
⚠️  No WhatsApp credentials configured - service in DEV MODE
```

**If you see the warning:**
- Credentials aren't saved in database yet
- OR server started before you added credentials

**Fix:**
1. Make sure you **saved** credentials in admin panel
2. **Restart the server**: `Ctrl+C` then `npm run dev`

---

### **Step 2: Check Server Logs When You Send Message**

**Send "Hi" to the WhatsApp number**, then immediately check your server terminal.

#### ✅ **Good - Webhook Received:**
```
POST /api/webhooks/whatsapp/inbound 200
📱 [WhatsApp OUT] To: +1234567890
   Message: Welcome to Retro Lounge! 🌿...
```

#### ❌ **Bad - No Logs at All:**
```
(nothing appears)
```

**This means Twilio is NOT calling your webhook.**

**Reasons:**
1. **Webhook URL is localhost** - Twilio can't reach it
2. **Webhook URL not configured** in Twilio sandbox settings
3. **Wrong URL** in Twilio

**Fix:**
- If testing locally, use **ngrok**: `ngrok http 5000`
- Use ngrok HTTPS URL in Twilio: `https://abc123.ngrok.io/api/webhooks/whatsapp/inbound`
- OR use your Replit production URL

#### ⚠️ **Partial - Webhook Received but DEV MODE:**
```
POST /api/webhooks/whatsapp/inbound 200
📱 [WhatsApp OUT] To: +1234567890
   [DEV MODE - No Twilio client configured]
```

**This means:**
- Webhook is working
- But service wasn't initialized with credentials
- Server needs restart

**Fix:**
1. Stop server: `Ctrl+C`
2. Verify credentials saved: `npx tsx scripts/diagnose-whatsapp.ts`
3. Restart: `npm run dev`
4. Look for `✅ WhatsApp service initialized`

---

### **Step 3: Verify Webhook URL in Twilio**

Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox

**Check "When a message comes in":**

#### ❌ **Wrong - Localhost:**
```
http://localhost:5000/api/webhooks/whatsapp/inbound
```
**Fix:** Change to public URL (Replit or ngrok)

#### ✅ **Correct - Public URL:**
```
https://your-app.repl.co/api/webhooks/whatsapp/inbound
```

**After changing:**
1. Click **Save**
2. Test by sending "Hi" again

---

### **Step 4: Check Twilio Debugger**

Go to: https://console.twilio.com/us1/monitor/logs/debugger

**Filter by:** WhatsApp messages

**Look for errors like:**
- `11200` - HTTP retrieval failure (URL not reachable)
- `11750` - TwiML response invalid
- `30007` - Webhook timeout (server too slow)

**Common errors:**

#### Error 11200 - "HTTP Retrieval Failure"
```
Unable to fetch content from https://your-url.com/api/webhooks/whatsapp/inbound
```

**Causes:**
- URL not publicly accessible
- Server not running
- Firewall blocking

**Fix:**
- Make sure server is running
- Use public URL (not localhost)
- Check Replit deployment is active

#### Error 11750 - "Invalid TwiML"
```
The TwiML response from your webhook is invalid
```

**Cause:** Server returning error instead of valid response

**Fix:**
- Check server logs for errors
- Server might be crashing on webhook call

---

### **Step 5: Test Webhook Locally**

Test if your webhook endpoint works:

```bash
bash scripts/test-webhook.sh
```

**OR manually:**

```bash
curl -X POST http://localhost:5000/api/webhooks/whatsapp/inbound \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=TEST123" \
  -d "AccountSid=ACtest" \
  -d "From=whatsapp:+1234567890" \
  -d "To=whatsapp:+14155238886" \
  -d "Body=Hi"
```

**Expected response:**
- Status: 200 OK
- Empty body (that's correct for Twilio webhooks)

**Check server logs for:**
```
POST /api/webhooks/whatsapp/inbound 200
📱 [WhatsApp OUT] To: +1234567890
```

---

## 🎯 **Most Common Issues & Fixes**

### **Issue 1: Server Shows DEV MODE**
**Symptom:** Logs show `[DEV MODE - No Twilio client configured]`

**Cause:** WhatsApp service not initialized with credentials

**Fix:**
1. Verify credentials saved:
   ```bash
   npx tsx scripts/diagnose-whatsapp.ts
   ```
2. If no credentials found: Re-add in admin panel
3. If credentials exist: Restart server
4. Look for `✅ WhatsApp service initialized` on startup

---

### **Issue 2: No Server Logs When Sending Message**
**Symptom:** Send "Hi" but nothing appears in server terminal

**Cause:** Twilio not calling your webhook (URL issue)

**Fix:**
1. Check Twilio sandbox settings
2. Verify webhook URL is **publicly accessible**
3. If localhost, use ngrok:
   ```bash
   ngrok http 5000
   # Copy HTTPS URL
   # Update in Twilio: https://abc123.ngrok.io/api/webhooks/whatsapp/inbound
   ```
4. Check Twilio debugger for errors

---

### **Issue 3: Webhook Signature Verification Fails**
**Symptom:** Server logs show `403 Forbidden` or "signature verification failed"

**Cause:** Twilio signature doesn't match (wrong Account SID in request)

**Fix:**
1. Make sure you're sending from the **same Twilio account** configured in admin panel
2. Check Twilio debugger for "AccountSid" in webhook payload
3. Verify it matches your credentials

---

### **Issue 4: Messages Send But Bot Doesn't Respond**
**Symptom:** Twilio logs show message sent, but customer gets nothing

**Possible causes:**

**A) Service in DEV MODE**
- Check logs for `[DEV MODE]`
- Restart server if needed

**B) Wrong From Number**
- Service uses different number than expected
- Check initialization logs: `fromPhone: '+14155238886'`
- Make sure customer joined THIS number's sandbox

**C) Twilio Account Balance Zero**
- Check Twilio console balance
- Add credits if needed

---

## 📝 **Diagnostic Checklist**

Run through this checklist:

- [ ] Credentials added in admin panel (Settings → Notifications)
- [ ] Clicked "Validate" and got success ✅
- [ ] Clicked "Save" to save credentials
- [ ] Toggled "WhatsApp Enabled" to ON
- [ ] Restarted server after adding credentials
- [ ] Server shows `✅ WhatsApp service initialized` on startup
- [ ] Webhook URL in Twilio is **publicly accessible** (not localhost)
- [ ] Webhook URL ends with `/api/webhooks/whatsapp/inbound`
- [ ] Your phone **joined the sandbox** (`join abc-xyz`)
- [ ] Server is running when you send message
- [ ] No errors in server logs
- [ ] No errors in Twilio debugger

---

## 🔬 **Advanced Debugging**

### Enable Detailed Logging

Edit `server/whatsappBookingService.ts`, add more logging:

```typescript
async handleInboundMessage(message: TwilioInboundMessage): Promise<string> {
  console.log('📨 [WhatsApp IN] Received:', JSON.stringify(message, null, 2));
  const phoneNumber = message.From.replace('whatsapp:', '');
  // ... rest of code
}
```

Restart server, send message, check logs.

---

### Check Database Directly

```bash
# Check if credentials exist
npx tsx scripts/diagnose-whatsapp.ts
```

Look for:
- Active credentials: ✅ YES
- From phone: +14155238886
- Credentials decrypted successfully: ✅

---

### Test Conversation State

Create test script:

```typescript
import { db } from './server/db';
import { whatsappConversations } from './shared/schema';

const conversations = await db.select().from(whatsappConversations);
console.log('Active conversations:', conversations.length);
conversations.forEach(c => {
  console.log(`  Phone: ${c.phoneNumber}, State: ${c.state}`);
});
```

---

## 🆘 **Still Not Working?**

### Share These Details:

1. **Server startup logs** (first 20 lines after `npm run dev`)
2. **What happens when you send "Hi"** (copy exact server logs)
3. **Twilio debugger** - any errors shown?
4. **Output of:** `npx tsx scripts/diagnose-whatsapp.ts`
5. **Webhook URL** you configured in Twilio
6. **Are you testing locally or on Replit?**

With this information, we can pinpoint the exact issue!

---

## ✅ **Success Looks Like This:**

**1. Server Startup:**
```
serving on port 5000
✅ WhatsApp service initialized { spaId: 1, fromPhone: '+14155238886' }
```

**2. When You Send "Hi":**
```
POST /api/webhooks/whatsapp/inbound 200
📱 [WhatsApp OUT] To: +1234567890
   Message: Welcome to Retro Lounge! 🌿...
```

**3. On Your Phone:**
```
(Message from +14155238886)
Welcome to Retro Lounge! 🌿

Would you like to book an appointment...
```

**That's it!** 🎉
