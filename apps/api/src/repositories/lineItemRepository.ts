import prisma from "../config/database";
import type { TransactionClient } from "./types";

const getClient = (tx?: TransactionClient) => tx ?? prisma;

export const findManyByRfpId = async (rfpId: number, tx?: TransactionClient) => {
  const client = getClient(tx);
  return client.lineItem.findMany({
    where: { rfpId },
    select: {
      id: true,
      sno: true,
      status: true,
    },
  });
};

export const createMany = async (
  rfpId: number,
  items: Array<{
    sno: number;
    status: string;
    fieldResponses: object;
    quantity?: number;
    price?: number;
    productId?: number;
    key?: string;
    [key: string]: unknown;
  }>,
  tx?: TransactionClient
) => {
  const client = getClient(tx);
  const data = items.map((item) => {
    const { key, ...rest } = item;
    return { ...rest, rfpId };
  });
  type CreateManyArg = NonNullable<Parameters<typeof client.lineItem.createMany>[0]>;
  return client.lineItem.createMany({
    data: data as CreateManyArg["data"],
  });
};

export const updateManyInTransaction = async (
  updates: Array<{
    id: number;
    sno: number;
    status: string;
    fieldResponses: object;
    quantity?: number;
    price?: number;
    productId?: number;
  }>,
  tx?: TransactionClient
) => {
  const client = getClient(tx);
  await Promise.all(
    updates.map((item) =>
      client.lineItem.update({
        where: { id: item.id },
        data: {
          sno: item.sno,
          status: item.status,
          fieldResponses: item.fieldResponses,
          quantity: item.quantity,
          price: item.price,
          productId: item.productId,
        },
      })
    )
  );
};

export const markDeleted = async (ids: number[], tx?: TransactionClient) => {
  if (ids.length === 0) return;
  const client = getClient(tx);
  return client.lineItem.updateMany({
    where: { id: { in: ids } },
    data: { status: "deleted" },
  });
};
