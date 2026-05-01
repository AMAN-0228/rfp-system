import prisma from "../config/database";
import type { TransactionClient } from "./types";

/** Run a callback inside a Prisma interactive transaction. Services use this instead of importing prisma. */
export const runInTransaction = async <T>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> => {
  return prisma.$transaction(fn);
};
