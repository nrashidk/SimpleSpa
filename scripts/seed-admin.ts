import bcrypt from "bcryptjs";
import { db } from "../server/db";
import { users, spas } from "../shared/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "retro_lounge@hotmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const SPA_NAME = process.env.SEED_SPA_NAME || "Retro Lounge";

async function seedAdmin() {
  console.log("=== Admin Seeding Script ===\n");

  if (!ADMIN_PASSWORD) {
    console.error("ERROR: SEED_ADMIN_PASSWORD environment variable is required");
    console.log("\nUsage:");
    console.log("  SEED_ADMIN_EMAIL=your@email.com SEED_ADMIN_PASSWORD=YourSecurePass123! SEED_SPA_NAME='Your Spa' npx tsx scripts/seed-admin.ts");
    process.exit(1);
  }

  if (ADMIN_PASSWORD.length < 12) {
    console.error("ERROR: Password must be at least 12 characters");
    process.exit(1);
  }

  const hasUppercase = /[A-Z]/.test(ADMIN_PASSWORD);
  const hasLowercase = /[a-z]/.test(ADMIN_PASSWORD);
  const hasNumber = /[0-9]/.test(ADMIN_PASSWORD);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(ADMIN_PASSWORD);

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    console.error("ERROR: Password must contain uppercase, lowercase, number, and special character");
    process.exit(1);
  }

  try {
    const existingUser = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));
    
    if (existingUser.length > 0) {
      console.log(`User ${ADMIN_EMAIL} already exists.`);
      console.log("Updating password...");
      
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.update(users)
        .set({ 
          password: hashedPassword,
          status: 'approved',
          role: 'admin'
        })
        .where(eq(users.email, ADMIN_EMAIL));
      
      console.log("Password updated successfully!");
    } else {
      console.log(`Creating new admin user: ${ADMIN_EMAIL}`);
      
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const userId = crypto.randomUUID();
      
      const existingSpa = await db.select().from(spas).where(eq(spas.name, SPA_NAME));
      let spaId: number;
      
      if (existingSpa.length > 0) {
        spaId = existingSpa[0].id;
        console.log(`Using existing spa: ${SPA_NAME} (ID: ${spaId})`);
      } else {
        const [newSpa] = await db.insert(spas).values({
          name: SPA_NAME,
          slug: SPA_NAME.toLowerCase().replace(/\s+/g, '-'),
          description: `Welcome to ${SPA_NAME}`,
          businessHours: {},
        }).returning();
        spaId = newSpa.id;
        console.log(`Created new spa: ${SPA_NAME} (ID: ${spaId})`);
      }
      
      await db.insert(users).values({
        id: userId,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: 'admin',
        status: 'approved',
        adminSpaId: spaId,
        firstName: 'Admin',
        lastName: 'User',
      });
      
      console.log(`Admin user created successfully!`);
    }

    console.log("\n=== SUCCESS ===");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Role: admin`);
    console.log(`Status: approved`);
    console.log("\nYou can now login at /login/admin");
    console.log("\nIMPORTANT: Delete this script after use for security.");
    
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

seedAdmin();
