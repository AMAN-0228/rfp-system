import { createCommonMetaDataForListing, deepCopy, validateFieldResponse } from "../utils/common";
import { ACTIONS, METHODS, SECTION_TYPES, TEMPLATE_TYPES } from "../utils/constant";
import { NotFoundError, ValidationError } from "../utils/errors";
import { TokenPayload } from "../utils/tokens"
import * as lisitngService from './lisitngService';
import * as templateService from "./templateService";
import * as rfpLineItemService from "./rfpLineItemService";
import * as rfpRepository from "../repositories/rfpRepository";
import { runInTransaction } from "../repositories/transactionRunner";

const generateRfpCode = async (values: any, auth: TokenPayload) => {
    if (values.method === METHODS.SAVE) {
        return 'RFP-DRAFT';
    }

    if (values.method === METHODS.SUBMIT && [ACTIONS.CREATE, ACTIONS.EDIT].includes(values.action)) {
        return 'RFP-';
    } else {
        const splitValues = values.code.splite('/');
        const code = splitValues[0];
        const amendCount = splitValues[1] || 0;
        return `${code}/${amendCount + 1}`;
    }
    
};

const createObj = async(values: any, auth: TokenPayload) => {
    const obj: any = {};
    // obj.userId = values.userId;
    obj.userId = auth.userId;
    obj.fieldResponses = deepCopy(values.fieldResponses || {});
    obj.subject = values.subject;
    obj.templateId = values.templateId;
    obj.active = true;
    if (values.method === METHODS.SAVE) {
        obj.status = 'drafted'
    }
    obj.code = await generateRfpCode({
        code: values.code,
        method: values.method,
        action: values.action,
    }, auth);
    // obj.da
    return obj;
};

const validateTemplateHeaderDetails = (values:any): any => {
   const {
    section,
    sectionKey,
    method,
    action,
    fieldResponses,
   } = values;
   
   const obj: any = {};
    if (section.type !== SECTION_TYPES.TABLE) {
        section.fieldOrder.forEach((fieldKey: string) => {
            const field = section.fields[fieldKey];
            const {isSystemField, value} = validateFieldResponse({
                method,
                action,
                fieldResponses,
            }, field)
            if (isSystemField) {
                obj[field.systemKey || ''] = value;
            } else {
                obj.fieldResponses[field.key || ''] = value;
            }
        })
    }
    return obj;
}

const validateTransactionFromTemplate = async (payload: any, auth: TokenPayload) => {
    if (!payload.template|| !payload.template.id) {
        throw new ValidationError('Template details are required');
    }

    const template = await templateService.getTemplateForView(payload.template.id, {}, auth);
    if (!template) {
        throw new NotFoundError('Template not found');
    }

    let headerDetails: any = {
        templateId: payload.template.id,
    };
    let lineItems: any = {
        rows: [],
        deletedItems: [],
    };
    template.sections.forEach((section: any) => {
        if (!section.key) {
            throw new ValidationError('Section key is required');
        }
        if (section.type !== SECTION_TYPES.TABLE) {
            const obj = validateTemplateHeaderDetails({
                section,
                sectionKey: section.key,
                method: payload.method,
                action: payload.action,
                fieldResponses: payload.template.schema[section.key].fieldResponses,
            });
            headerDetails = {
                ...headerDetails,
                ...obj,
            }
        }
        if (section.type === SECTION_TYPES.TABLE) {
            const {rows, deletedItems} = rfpLineItemService.validateLineItems({
                fields: section.fields,
                fieldOrder: section.fieldOrder,
                method: payload.method,
                action: payload.action,
                rows: payload.template.schema[section.key].rows,
                rowOrder: payload.template.schema[section.key].rowOrder,
            })
            lineItems = {
                ...lineItems,
                rows: [...lineItems.rows, ...rows],
                deletedItems: [...lineItems.deletedItems, ...deletedItems],
            }
        }
        
    })

    return {
        headerDetails,
        lineItems,
    }
}

const validateInput = async (payload: any, auth: TokenPayload) => {
    const obj = {
        headerDetails: {},
        lineItems: {
            rows: [],
            deletedItems: [],
        },
    }
    const {headerDetails, lineItems} = await validateTransactionFromTemplate(payload, auth);

    obj.headerDetails = await createObj({
        ...headerDetails,
        method: payload.method,
        action: payload.action,
        templateId: payload.templateId,
    }, auth);

    obj.lineItems = lineItems;
    return obj;
}

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

    const createObj: any = await validateInput(payload, auth);

    if (payload.action === ACTIONS.CREATE && payload.method === METHODS.SUBMIT) {
        createObj.headerDetails.status = 'submitted';
    }

    await runInTransaction(async (tx) => {
        const rfp = await rfpRepository.create({ ...createObj.headerDetails }, tx);
        await rfpLineItemService.lineItemsUpdate(
            rfp.id,
            { ...createObj.lineItems, action: payload.action },
            auth,
            tx
        );
    });
}


export const edit = async(payload: any, auth: TokenPayload) => {
    if (!payload.method || !payload.action) {
        throw new ValidationError('Method and action both are required');
    }
}