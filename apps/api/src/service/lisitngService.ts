import { skip } from "@prisma/client/runtime/client";
import prisma from "../config/database";
import { checkModelInMapping } from "../utils/common";
import { modelMapping } from "../utils/constant";
import { TokenPayload } from "../utils/tokens";



export const allForListing = async (filter: any, options:any, model: string, auth: TokenPayload) => {
    checkModelInMapping(model);
    if (options.take) {
    filter.take = options.take;
    }
    if (options.skip) {
        filter.skip = options.skip;
    }
    return await prisma[modelMapping[model]].findMany({
        ...filter,
    });
};

export const countForListing = async (filter: any, model: string, auth: TokenPayload) => {
    checkModelInMapping(model);
    return await prisma[modelMapping[model]].count({
        ...filter,
    });
};

export const supplierListingData = async (options: any, auth: TokenPayload) => {
    const sort = 'createdAt';

    const filter = {
        orderBy: {
            [options.sort || sort]: options.order,
        },
        where: {},
        select: {
            id: true,
            name: true,
            email: true,
            code: true,
            createdAt: true,
            searchString: true,
            creator: {
                select: {
                    id: true,
                    name: true,
                }
            }
        }
    } as any;

    if (options.search) {
        filter.where['searchString'] = {
            contains: options.search,
            mode: 'insensitive',
        }
    }
    if (options.creatorId) {
        filter.where['creatorId'] = options.creatorId;
    }
    if (options.active) {
        filter.where['active'] = options.active;
    }
    if (options.isRegistered) {
        filter.where['isRegistered'] = options.isRegistered;
    }
    if (options.status) {
        filter.where['status'] = options.status;
    }


    const [suppliers = [], count = 0] = await Promise.all(
        [
            allForListing(filter, options, 'SUPPLERS', auth),
            countForListing(filter.where, 'Suppliers', auth),
        ]);
    
    return {suppliers, count};
};

export const rfpForListing = async (options: any, auth: TokenPayload) => {

    const filter= {
        orderBy: {
            [options.sort || 'createdAt']: options.order || 'desc'
        },          
        where :{
            userId: auth.userId,
        },
        select: {
            id: true,
            code: true,
            status: true,
            subject: true,
            createdAt: true,
            userId: true,
            user: {
                select:{
                    id: true,
                    name: true,
                }
            }
        },
        include: {
            suppliers: {
                select: {
                    supplierId: true,
                    supplier: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        }
                    }
                }
            }
        }
    }

    if (options.search) {
        filter.where['searchString'] = {
            contains: options.search,
            mode: 'insensitive',
        }
    }

    if (options.status) {
        filter.where['status'] = options.status;
    }
    if (options.active) {
        filter.where['active'] = options.active
    }

    if (options.supplierId) {
        filter.where['suppliers']  = {
            some: {
                supplierId: options.supplierId
            }
        }
    }

    const [rfps = [], count ] = await Promise.all([
        allForListing(filter, {take: options.take,skip: options.skip }, 'RFP', auth),
        countForListing(filter, 'RFP', auth)
    ]);
    return { rfps, count };
};