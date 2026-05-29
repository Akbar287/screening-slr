import { PrismaClient } from './node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  console.log('Users in DB:', users.length);
  if (users.length > 0) {
    console.log(users.map(u => ({id: u.id.toString(), username: u.username})));
  }
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
