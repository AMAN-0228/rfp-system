import prisma from '../config/database';
import * as userRepository from '../repositories/userRepository';
import { hashPassword } from '../utils/password';

const ADMIN_EMAIL = 'admin@local';
const ADMIN_PASSWORD = 'Admin@12345';
const ADMIN_NAME = 'Admin';

const run = async () => {
  const existing = await userRepository.findFirst({});
  if (existing) {
    console.log(`Users already exist (found id=${existing.id}, email=${existing.email}). Skipping admin creation.`);
    return;
  }

  const password = await hashPassword(ADMIN_PASSWORD);
  const admin = await userRepository.create({
    data: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      password,
      active: true,
    },
  });

  console.log(`Admin created: id=${admin.id}, email=${admin.email}`);
  console.log(`Login password: ${ADMIN_PASSWORD}  (change immediately)`);
};

run()
  .catch((err) => {
    console.error('Failed to create admin:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
