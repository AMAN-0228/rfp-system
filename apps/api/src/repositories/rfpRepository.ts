import prisma from "../config/database";
import type { TransactionClient } from "./types";

const getClient = (tx?: TransactionClient) => tx ?? prisma;

export const create = async (data: Record<string, unknown>, tx?: TransactionClient) => {
  const client = getClient(tx);
  return client.rFP.create({ data: data as Parameters<typeof client.rFP.create>[0]["data"] });
};

export const findManyForListing = async (filter: {
  where: object;
  orderBy: object;
  select: object;
  include?: object;
  take?: number;
  skip?: number;
}) => {
  return prisma.rFP.findMany(filter);
};

export const countForListing = async (where: object) => {
  return prisma.rFP.count({ where });
};
