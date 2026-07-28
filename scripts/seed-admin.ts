import bcrypt from 'bcrypt';
import { PrismaClient, Role } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@feature-flags.internal';
  const name = process.env.ADMIN_NAME || 'Admin';
  const role = (process.env.ADMIN_ROLE as Role) || Role.ADMIN;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists (id: ${existing.id}).`);
    await prisma.$disconnect();
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise<string>((resolve) => {
    rl.question('Enter password for admin user: (min 8 chars) ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, passwordHash, name, role },
  });

  console.log(`Admin user created: ${user.email} (id: ${user.id}, role: ${user.role})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
