import { Request, Response } from "express";
import * as rfpService from '../service/rfpService';

export const getAllRfpForListing = async (req: Request, res: Response) => {
    const options = {
        status: req.query.status,
        userId: req.query.userId? Number(req.query.userId): '',
        search: req.query.search,
        page: req.query.page? Number(req.query.page): null,
        supplierId: req.query.supplierId,
    }

    const {rfps, countData} =  await rfpService.getAllRfpForListing(options, req.auth!);


    
    res.status(200)
        .json({
            data: rfps,
            metaData: {
                ...countData,
            },
            success: true
        });
};

export const createNew = async (req: Request, res: Response) => {

    const id = await rfpService.createNew({
        ...req.body,
        action: 'create'
    }, req.auth!);

    res.status(200)
        .json({
            id,
            success: true,
        })
};