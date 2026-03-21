import { Request, Response } from "express";
import * as rfpService from '../service/rfpService';
import { TokenPayload } from "../utils/tokens";

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

export const createNew = async (req: Request & { auth: TokenPayload }, res: Response) => {
//     RowActions = ['create', 'update', 'delete' ]
// RFP payload
// {
//   action: 'create',
//   method: 'submit',
//   appId: 12,
//   template: {
//     id: 1,
//     schema: {
//       generalSection: {
//         key: 'generalSection',
//         fieldResponses: {
//           generalSection_subject: 'test subjet',
//           generalSection_reference: 'ref-2w3',
//           generalSection_Currency: 1,
//           ...
//         },
//         sectionType: 'form',
//       },
//       lineItemSection:{
//         key: 'lineItemSection'
//         rowOrder: ['ghf78', 'uio98'],
//         rows: [
//           {
//             key: 'ghf78',
//             action: RowAction[0],
//             id?: 123,
//              fildResponses: {
//                lineItemSection_product: 234,
//                lineItemSection_UOM: {
//                  reference: 'kg',
//                  label: 'kg',
//                  id: 34,
//                },
//                lineItemSection_price: null,
//                lineItemSection_quantity: 3,
//              }
//           },
//           {
//             key: 'uio98',
//             action: RowAction[0],
//             id?: 124,
//              fildResponses: {
//                lineItemSection_product: 153,
//                lineItemSection_UOM: {
//                  reference: 'l',
//                  label: 'l',
//                  id: 13,
//                },
//                lineItemSection_price: null,
//                lineItemSection_quantity: 2,
//              }
//           }
//         ]
//       }
//     ]
//   }
// }
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