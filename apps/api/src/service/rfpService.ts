import { createCommonMetaDataForListing } from "../utils/common";
import { ValidationError } from "../utils/errors";
import { TokenPayload } from "../utils/tokens"
import * as lisitngService from './lisitngService';

export const getAllRfpForListing = async(options: any, auth: TokenPayload) => {
    const {page = 1, limit = 10, sort ='createdAt', order = 'desc' } = options;
    const skip = (page - 1) * limit;
    const take = limit;

    const {rfps, count} = await lisitngService.rfpForListing({
        ...options,
        take,
        skip,
        order,
        sort,
    }, auth);

    const countData = createCommonMetaDataForListing({count, limit, page})

    return {
        rfps,
        countData,
    }
};

export const createNew = async(payload: any, auth: TokenPayload) => {
    if (!payload.method || !payload.action) {
        throw new ValidationError('Method and action both are required');
    }
}


export const edit = async(payload: any, auth: TokenPayload) => {
    if (!payload.method || !payload.action) {
        throw new ValidationError('Method and action both are required');
    }
}