require('dotenv').config();

const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');

async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(databaseUrl.hostname)) {
    throw new Error('Local bootstrap is restricted to a localhost PostgreSQL database.');
  }

  const email = process.env.LOCAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Set LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD (at least 12 characters) before bootstrapping.');
  }

  const gym = await prisma.gym.upsert({
    where: { id: 'gym-crm-local' },
    update: { name: 'Gym CRM' },
    create: { id: 'gym-crm-local', name: 'Gym CRM', address: 'Local workspace' },
  });

  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log(`Account ${email} already exists; left it unchanged.`);
    return;
  }

  await prisma.user.create({
    data: {
      name: 'Gym CRM Super Admin',
      email,
      password: await bcrypt.hash(password, 12),
      role: 'superadmin',
      gymId: gym.id,
      isVerified: true,
    },
  });

  console.log(`Created the local Gym CRM workspace and super-admin account for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
