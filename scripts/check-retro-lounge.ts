import { db } from '../server/db';
import { spas, users, spaNotificationSettings, spaNotificationCredentials } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkRetroLounge() {
  try {
    console.log('\n🔍 Searching for Retro Lounge spa...\n');

    // Find all spas
    const allSpas = await db.select().from(spas);

    console.log('📍 All Spas in Database:');
    console.log('========================');
    allSpas.forEach(spa => {
      console.log(`  ${spa.id}. ${spa.name}`);
      console.log(`     Slug: ${spa.slug}`);
      console.log(`     Active: ${spa.active}`);
      console.log(`     Setup Complete: ${spa.setupComplete}`);
      console.log('');
    });

    // Find retro_lounge admin
    const [admin] = await db.select().from(users).where(eq(users.email, 'retro_lounge@hotmail.com'));

    if (!admin) {
      console.log('❌ Admin user retro_lounge@hotmail.com not found!');
      console.log('\nAll admin users:');
      const admins = await db.select().from(users).where(eq(users.role, 'admin'));
      admins.forEach(u => console.log(`  - ${u.email || u.phone} (ID: ${u.id}, Role: ${u.role})`));
      process.exit(1);
    }

    console.log('✅ Found Admin User:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Name: ${admin.firstName} ${admin.lastName}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Admin Spa ID: ${admin.adminSpaId}`);
    console.log('');

    if (!admin.adminSpaId) {
      console.log('❌ Admin user not linked to any spa!');
      process.exit(1);
    }

    // Get admin's spa
    const [spa] = await db.select().from(spas).where(eq(spas.id, admin.adminSpaId));

    if (!spa) {
      console.log(`❌ Spa with ID ${admin.adminSpaId} not found!`);
      process.exit(1);
    }

    console.log('✅ Admin\'s Spa:');
    console.log(`   ID: ${spa.id}`);
    console.log(`   Name: ${spa.name}`);
    console.log(`   Slug: ${spa.slug}`);
    console.log(`   Contact Email: ${spa.contactEmail || 'Not set'}`);
    console.log(`   Contact Phone: ${spa.contactPhone || 'Not set'}`);
    console.log(`   Active: ${spa.active}`);
    console.log(`   Setup Complete: ${spa.setupComplete}`);
    console.log('');

    // Check notification settings
    const [notifSettings] = await db
      .select()
      .from(spaNotificationSettings)
      .where(eq(spaNotificationSettings.spaId, spa.id));

    if (notifSettings) {
      console.log('📱 Notification Settings:');
      console.log(`   Email Enabled: ${notifSettings.emailEnabled}`);
      console.log(`   SMS Enabled: ${notifSettings.smsEnabled}`);
      console.log(`   WhatsApp Enabled: ${notifSettings.whatsappEnabled}`);
      console.log(`   Send Confirmation: ${notifSettings.sendConfirmation}`);
      console.log(`   Send Reminder: ${notifSettings.sendReminder}`);
      console.log('');
    } else {
      console.log('⚠️  No notification settings configured yet');
      console.log('');
    }

    // Check WhatsApp credentials
    const credentials = await db
      .select()
      .from(spaNotificationCredentials)
      .where(eq(spaNotificationCredentials.spaId, spa.id));

    if (credentials.length > 0) {
      console.log('🔐 Configured Providers:');
      credentials.forEach(cred => {
        console.log(`   ${cred.channel} via ${cred.provider}`);
        console.log(`     From: ${cred.fromEmail || cred.fromPhone || 'Not set'}`);
        console.log(`     Active: ${cred.isActive}`);
      });
      console.log('');
    } else {
      console.log('⚠️  No notification providers configured');
      console.log('   → Add via Admin Panel: Settings → Notifications');
      console.log('');
    }

    console.log('✅ Ready to configure WhatsApp!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Login to admin panel: http://localhost:5000/admin/login');
    console.log(`2. Email: retro_lounge@hotmail.com`);
    console.log('3. Go to Settings → Notifications');
    console.log('4. Add Twilio WhatsApp provider');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('connect')) {
      console.log('\n💡 Tip: Make sure DATABASE_URL is set in Replit Secrets');
    }
  } finally {
    process.exit(0);
  }
}

checkRetroLounge();
