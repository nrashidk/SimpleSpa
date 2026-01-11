# 📱 WhatsApp Booking - Complete Testing Guide for Retro Lounge

## ✅ What I've Done

1. ✅ Added WhatsApp service initialization to `server/index.ts`
2. ✅ Created helper scripts for verification
3. ✅ Documented Twilio setup process

## 🚀 Complete Setup & Testing Steps

### **STEP 1: Get Twilio Credentials**

#### 1.1 Login to Twilio
- Go to: https://console.twilio.com
- Login with: nrashidk@gmail.com

#### 1.2 Get Account Credentials
From the Twilio Dashboard:
- **Account SID**: Starts with `AC...` (e.g., `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
- **Auth Token**: Click "Show" to reveal (e.g., `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

📋 **Copy these - you'll need them in Step 3**

#### 1.3 Setup WhatsApp Sandbox
1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. You'll see:
   - **Sandbox Number**: `+1 415 523 8886`
   - **Join Code**: Something like `join abc-xyz`

#### 1.4 Activate Sandbox on Your Phone
1. Open **WhatsApp** on your phone
2. Send message to: **+1 415 523 8886**
3. Type exactly: `join abc-xyz` (use your actual join code)
4. You should receive: *"You are all set!"* confirmation

✅ **WhatsApp sandbox is now active for your phone number**

---

### **STEP 2: Start Development Server**

```bash
npm run dev
```

**Expected output:**
```
serving on port 5000
[Scheduler] Starting appointment scheduler...
⚠️  No WhatsApp credentials configured - service in DEV MODE
```

The warning is expected because you haven't configured credentials yet.

**Keep this terminal open!**

---

### **STEP 3: Configure WhatsApp in Admin Panel**

#### 3.1 Open Admin Panel
Open browser: http://localhost:5000/admin/login

#### 3.2 Login
- **Email**: `retro_lounge@hotmail.com`
- **Password**: (your password)

#### 3.3 Navigate to Settings
1. Click **"Settings"** in the left sidebar
2. Click **"Notifications"** tab

You should see two sections:
- Notification Settings (toggles)
- Notification Providers (list of configured providers)

#### 3.4 Add WhatsApp Provider
1. Click **"Add Provider"** button
2. Fill in the form:

   ```
   Provider: Twilio
   Channel: WhatsApp
   Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Auth Token: your_auth_token_from_step_1_2
   From Phone Number: +14155238886
   ```
   *(Replace with your actual credentials from Step 1.2)*

3. Click **"Validate"** button
   - Should show: ✅ "Validation successful" with your account balance
   - If it fails, double-check credentials

4. Click **"Save"** button
   - Should show: ✅ "Provider configured"

#### 3.5 Enable WhatsApp Notifications
In the "Notification Settings" section:

1. Toggle **ON**:
   - ✅ WhatsApp Enabled
   - ✅ Send Confirmations
   - ✅ Send Reminders

2. Click **"Save Settings"** button

✅ **WhatsApp is now configured for Retro Lounge!**

#### 3.6 Restart Server to Initialize WhatsApp
1. Go back to your terminal
2. Press `Ctrl+C` to stop the server
3. Start again: `npm run dev`

**New expected output:**
```
serving on port 5000
[Scheduler] Starting appointment scheduler...
✅ WhatsApp service initialized { spaId: 1, fromPhone: '+14155238886' }
```

✅ **WhatsApp service is now LIVE!**

---

### **STEP 4: Configure Twilio Webhook**

#### 4.1 Get Your Replit App URL
If running on Replit, your URL is something like:
```
https://your-repl-name.your-username.repl.co
```

For local development, you'll need **ngrok** or similar:
```bash
ngrok http 5000
# Copy the https:// URL
```

#### 4.2 Set Webhook in Twilio
1. Go to: https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox
2. Under **"Sandbox Configuration"**:

   **When a message comes in:**
   - URL: `https://your-app-url/api/webhooks/whatsapp/inbound`
   - Method: `POST`

3. Click **"Save"**

✅ **Webhook configured!**

---

### **STEP 5: Test WhatsApp Booking Flow**

#### 5.1 Initiate Conversation
From your phone (that joined the sandbox):

**Send to** `+1 415 523 8886`:
```
Hi
```

**Bot Response:**
```
Welcome to Retro Lounge! 🌿

Would you like to book an appointment at our location or request a home service?

1. 📍 At Spa
2. 🏠 Home Service

Reply with a number to select.
```

#### 5.2 Select Location
**You send:**
```
1
```

**Bot Response:**
```
Please select a service category:

1. Massage
2. Facial Treatments
3. Hair Services
...

Reply with a number.
```

#### 5.3 Select Category
**You send:**
```
1
```

**Bot Response:**
```
Services in Massage:

1. Swedish Massage - AED 200 (60 min)
2. Deep Tissue Massage - AED 250 (90 min)
3. Hot Stone Massage - AED 300 (90 min)

Reply with a number, or type 'done' when finished selecting.
```

#### 5.4 Add Service
**You send:**
```
1
```

**Bot Response:**
```
✅ Added: Swedish Massage

Current selection:
• Swedish Massage - AED 200 (60 min)

Total: AED 200 | Duration: 60 minutes

Select another service or reply 'done' to continue.
```

#### 5.5 Complete Selection
**You send:**
```
done
```

**Bot Response:**
```
Selected services:
• Swedish Massage - AED 200 (60 min)

Total: AED 200 | Duration: 60 minutes

Select a professional:
0. Any Available
1. Sarah (Massage Specialist)
2. Maria (Senior Therapist)

Reply with a number.
```

#### 5.6 Select Staff
**You send:**
```
1
```

**Bot Response:**
```
Great choice! Sarah is an excellent therapist.

Please enter your preferred date (e.g., 'tomorrow', 'Jan 15', '2026-01-15'):
```

#### 5.7 Enter Date
**You send:**
```
tomorrow
```

**Bot Response:**
```
Date: January 12, 2026

Available time slots:
1. 9:00 AM
2. 9:30 AM
3. 10:00 AM
...

Reply with a number.
```

#### 5.8 Select Time
**You send:**
```
3
```

**Bot Response:**
```
📋 Booking Summary

📍 Retro Lounge
🏠 At Spa
📅 January 12, 2026
⏰ 10:00 AM
👤 Sarah

Services:
• Swedish Massage - AED 200 (60 min)

💰 Total: AED 200
⏱ Duration: 60 minutes

Reply 'confirm' to book or 'cancel' to start over.
```

#### 5.9 Confirm Booking
**You send:**
```
confirm
```

**Bot Response:**
```
🎉 Booking Created!

Booking #123
📅 January 12, 2026 at 10:00 AM
👤 Sarah

💳 Complete your payment here:
[Stripe Payment Link]

Or reply 'pay later' to pay at the venue instead.
```

#### 5.10 Choose Payment
**You send:**
```
pay later
```

**Bot Response:**
```
✅ Booking Confirmed!

Booking #123
📅 January 12, 2026 at 10:00 AM
👤 Sarah
📍 Retro Lounge

Services:
• Swedish Massage - AED 200

💰 Payment: At venue

We'll send you a reminder 24 hours before your appointment.

To make a new booking, just say 'hi'!
```

✅ **BOOKING COMPLETE!**

---

### **STEP 6: Verify in Admin Panel**

1. Go to: http://localhost:5000/admin/dashboard
2. Click **"Bookings"** in sidebar
3. You should see the new booking:
   - Customer phone number
   - Service: Swedish Massage
   - Date/Time: Tomorrow 10:00 AM
   - Status: Confirmed
   - Payment: Pending

---

### **STEP 7: Test Automated Notifications**

#### 7.1 Test 24-Hour Reminder
The scheduler runs every hour and sends reminders for bookings 23-24 hours away.

To test immediately, you can manually trigger it:
```bash
# In another terminal
curl -X POST http://localhost:5000/api/admin/scheduler/run-now \
  -H "Content-Type: application/json"
```

**Expected WhatsApp:**
```
⏰ Appointment Reminder

Hi! This is a friendly reminder about your upcoming appointment.

📋 Booking #123
🏪 Retro Lounge
📅 Tomorrow at 10:00 AM
👤 Sarah

Services:
• Swedish Massage

💰 Total: AED 200

We look forward to seeing you! Reply "confirm" to confirm or "reschedule" if needed.
```

#### 7.2 Test Completion & Review
After the appointment:

1. In admin panel, mark booking as **"Completed"**
2. Scheduler will send review request automatically

**Expected WhatsApp:**
```
✨ Thank you for visiting Retro Lounge!

We hope you enjoyed your experience. Reply "rate" to share feedback.

Reply "hi" anytime to book your next appointment! 💆‍♀️
```

#### 7.3 Test Review Flow
**You send:**
```
rate
```

**Bot Response:**
```
Thank you for visiting! We'd love your feedback.

Rate your visit from 1-5 stars:
1 = Poor
2 = Fair
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or 'skip'.
```

**You send:**
```
5
```

**Bot Response:**
```
Thank you for your 5-star rating! ⭐⭐⭐⭐⭐

Would you like to leave a comment? (This helps us improve!)
Reply with your comment, or 'skip'.
```

**You send:**
```
Amazing massage! Sarah was wonderful.
```

**Bot Response:**
```
Thank you so much for your feedback! We truly appreciate it.

We look forward to seeing you again soon! 💆‍♀️
Reply 'hi' to book your next appointment.
```

---

## 🎉 **Success Checklist**

- [ ] Twilio sandbox activated on your phone
- [ ] Server started with WhatsApp initialization message
- [ ] Admin panel accessible
- [ ] WhatsApp credentials configured and validated
- [ ] Webhook URL set in Twilio
- [ ] Received welcome message when sending "Hi"
- [ ] Completed full booking flow
- [ ] Booking visible in admin panel
- [ ] Received reminder message
- [ ] Completed review flow

---

## 🐛 **Troubleshooting**

### Server shows: "⚠️ No WhatsApp credentials configured"
**Solution:**
1. Make sure you saved credentials in admin panel
2. Restart the server: `Ctrl+C` then `npm run dev`

### Bot doesn't respond to "Hi"
**Check:**
1. Did you join the Twilio sandbox? (Send `join abc-xyz`)
2. Is webhook URL configured correctly in Twilio?
3. Is server running? Check terminal for errors
4. Check server logs for incoming webhook calls

### Validation fails in admin panel
**Check:**
1. Account SID starts with `AC`
2. Auth Token has no spaces
3. Credentials are from the same Twilio account
4. Internet connection is working

### Bot responds but messages have wrong spa name
**Solution:**
1. Check spa name in admin panel: Settings → Basic Info
2. Edit if needed and save

### Payment link doesn't work
**Check:**
1. Is Stripe configured? (Check Settings → Payments)
2. For testing, use "pay later" option

---

## 📞 **Support**

If you encounter issues:

1. **Check server logs**: Terminal where `npm run dev` is running
2. **Check Twilio logs**: https://console.twilio.com/us1/monitor/logs/debugger
3. **Check database**: Use `scripts/check-retro-lounge.ts`

---

## 🎯 **What's Next?**

### For Production Use:

1. **Apply for WhatsApp Business API**
   - Go to: https://www.twilio.com/whatsapp
   - Fill business profile
   - Wait 7-14 days for approval

2. **Get Dedicated WhatsApp Number**
   - Purchase from Twilio
   - No more "join" code needed

3. **Submit Message Templates**
   - WhatsApp requires pre-approved templates
   - Submit booking confirmation template
   - Submit reminder template

4. **Update Webhook to Production URL**
   - Use your production domain
   - Ensure HTTPS

---

**You're all set! 🎉**

Enjoy your WhatsApp booking system for Retro Lounge!
