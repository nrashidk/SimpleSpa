import { db } from '../server/db';
import { spas, users } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function checkSpas() {
  try {
    const allSpas = await db.select().from(spas);
    console.log('\n📊 Spas in database:');
    console.log('==================');
    for (const spa of allSpas) {
      console.log(`\nID: ${spa.id}`);
      console.log(`Name: ${spa.name}`);
      console.log(`Slug: ${spa.slug}`);
      console.log(`Active: ${spa.active}`);
      console.log(`Contact Phone: ${spa.contactPhone || 'Not set'}`);
      console.log(`Setup Complete: ${spa.setupComplete}`);

      // Find admin user
      if (spa.ownerUserId) {
        const [owner] = await db.select().from(users).where(eq(users.id, spa.ownerUserId));
        if (owner) {
          console.log(`Owner: ${owner.email || owner.phone || 'Unknown'}`);
        }
      }
    }
    console.log('\n==================\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkSpas();
