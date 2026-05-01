import prisma from "../config/database";

export const findByIdForView = async (id: number) => {
  return prisma.template.findUnique({
    where: { id },
    include: {
      sections: {
        include: {
          fields: true,
        },
      },
    },
  });
};
