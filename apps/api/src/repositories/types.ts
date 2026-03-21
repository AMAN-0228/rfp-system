// Value import needed so typeof prisma.$transaction is available for type extraction
import prisma from "../config/database";

/**
 * Type of the transaction client passed to the callback in prisma.$transaction(async (tx) => ...).
 * Repository methods that need to run inside a transaction accept this as an optional second argument.
 */
export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];
