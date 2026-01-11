import { db } from '../server/db';
import { spaNotificationCredentials, spas } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import { decryptJSON } from '../server/encryptionService';

async function diagnoseWhatsApp() {
  console.log('\n🔍 WhatsApp Setup Diagnostic\n');
  console.log('=' .repeat(60));

  try {
    // Check all spas
    const allSpas = await db.select().from(spas);
    console.log(`\n📍 Found ${allSpas.length} spa(s) in database\n`);

    // Check WhatsApp credentials
    const allCreds = await db.select().from(spaNotificationCredentials);
    const whatsappCreds = allCreds.filter(c => c.channel === 'whatsapp');

    console.log(`📱 WhatsApp Credentials: ${whatsappCreds.length} configured\n`);

    if (whatsappCreds.length === 0) {
      console.log('❌ NO WHATSAPP CREDENTIALS FOUND');
      console.log('\nAction needed:');
      console.log('1. Login to admin panel');
      console.log('2. Go to Settings → Notifications');
      console.log('3. Add Twilio WhatsApp provider');
      process.exit(1);
    }

    // Check each credential
    for (const cred of whatsappCreds) {
      const [spa] = await db.select().from(spas).where(eq(spas.id, cred.spaId));

      console.log(`\nSpa: ${spa?.name || 'Unknown'} (ID: ${cred.spaId})`);
      console.log(`  Provider: ${cred.provider}`);
      console.log(`  From Phone: ${cred.fromPhone}`);
      console.log(`  Active: ${cred.isActive ? '✅ YES' : '❌ NO'}`);

      if (!cred.isActive) {
        console.log('  ⚠️  This provider is INACTIVE - won\'t be used');
        continue;
      }

      try {
        const decrypted = decryptJSON(cred.encryptedCredentials);
        console.log(`  Account SID: ${decrypted.accountSid?.substring(0, 10)}...`);
        console.log(`  Auth Token: ${decrypted.authToken ? '****** (present)' : '❌ MISSING'}`);

        if (!decrypted.accountSid || !decrypted.authToken) {
          console.log('  ❌ Invalid credentials');
        } else {
          console.log('  ✅ Credentials decrypted successfully');
        }
      } catch (error: any) {
        console.log(`  ❌ Failed to decrypt: ${error.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 CHECKLIST:\n');

    const hasActiveCreds = whatsappCreds.some(c => c.isActive);
    console.log(`${hasActiveCreds ? '✅' : '❌'} Active WhatsApp credentials configured`);

    const activeWithPhone = whatsappCreds.filter(c => c.isActive && c.fromPhone);
    console.log(`${activeWithPhone.length > 0 ? '✅' : '❌'} From phone number set`);

    console.log('\n📝 NEXT STEPS:\n');

    if (!hasActiveCreds) {
      console.log('1. ❌ No active credentials - add in admin panel');
    } else {
      console.log('1. ✅ Credentials configured');
      console.log('2. ⚠️  Restart server to initialize WhatsApp service:');
      console.log('   - Stop server (Ctrl+C)');
      console.log('   - Run: npm run dev');
      console.log('   - Look for: "✅ WhatsApp service initialized"');
      console.log('\n3. 🔍 Check server logs when you send a message');
      console.log('   - Should see: "📱 [WhatsApp OUT]" when bot replies');
      console.log('   - If you see "DEV MODE", server needs restart');
      console.log('\n4. 🌐 Verify webhook URL in Twilio:');
      console.log('   - Must be publicly accessible (not localhost)');
      console.log('   - Format: https://your-app.repl.co/api/webhooks/whatsapp/inbound');
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ENCRYPTION_KEY')) {
      console.log('\n💡 Make sure ENCRYPTION_KEY is set in your .env or Replit Secrets');
    }
  } finally {
    process.exit(0);
  }
}

diagnoseWhatsApp();
