import prisma from "../config/database";

type SupplierFindUniqueArgs = Parameters<typeof prisma.supplier.findUnique>[0];
type SupplierFindFirstArgs = Parameters<typeof prisma.supplier.findFirst>[0];
type SupplierCreateArgs = Parameters<typeof prisma.supplier.create>[0];
type SupplierUpdateArgs = Parameters<typeof prisma.supplier.update>[0];

export const findUnique = async (args: SupplierFindUniqueArgs) => {
  return prisma.supplier.findUnique(args);
};

export const findFirst = async (args: SupplierFindFirstArgs) => {
  return prisma.supplier.findFirst(args);
};

export const create = async (args: SupplierCreateArgs) => {
  return prisma.supplier.create(args);
};

export const update = async (args: SupplierUpdateArgs) => {
  return prisma.supplier.update(args);
};

export const findManyForListing = async (filter: {
  where?: object;
  orderBy: object;
  select: object;
  take?: number;
  skip?: number;
}) => {
  return prisma.supplier.findMany(filter);
};

export const countForListing = async (where: object) => {
  return prisma.supplier.count({ where });
};

/** Fetch supplier name, email, code and update its searchString. */
export const updateSearchString = async (supplierId: number) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { name: true, email: true, code: true },
  });
  if (!supplier) return null;
  const searchString = `${supplier.code} ${supplier.name} ${supplier.email}`;
  return prisma.supplier.update({
    where: { id: supplierId },
    data: { searchString },
  });
};
