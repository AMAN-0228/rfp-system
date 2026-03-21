import prisma from "../config/database";

type UserFindUniqueArgs = Parameters<typeof prisma.user.findUnique>[0];
type UserFindFirstArgs = Parameters<typeof prisma.user.findFirst>[0];
type UserCreateArgs = Parameters<typeof prisma.user.create>[0];
type UserUpdateArgs = Parameters<typeof prisma.user.update>[0];

export const findUnique = async (args: UserFindUniqueArgs) => {
  return prisma.user.findUnique(args);
};

export const findFirst = async (args: UserFindFirstArgs) => {
  return prisma.user.findFirst(args);
};

export const create = async (args: UserCreateArgs) => {
  return prisma.user.create(args);
};

export const update = async (args: UserUpdateArgs) => {
  return prisma.user.update(args);
};
