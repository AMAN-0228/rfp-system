import * as userRepository from "../repositories/userRepository";
import * as supplierRepository from "../repositories/supplierRepository";
import { DbError, ValidationError } from "./errors";
import { TokenPayload } from "./tokens";
import { ACTIONS, FIELD_TYPES, METHODS, modelMapping, REGEX_MAPPING } from "./constant";
import { Field } from "../types/templates";
// import { roundToPrecision } from '@rfp-system/decimal';
export const markActiveAndInactive = async (values: {id: number, active: boolean, userType: 'user' | 'supplier'}, auth: TokenPayload) => {
    const { id, active, userType } = values;
    if (!id || !active || !userType) {
        throw new ValidationError('Id, active and userType are required');
    }
    if (userType === 'user') {
        return await userRepository.update({
            where: { id },
            data: { active },
        });
    } else if (userType === 'supplier') {
        return await supplierRepository.update({
            where: { id },
            data: { active },
        });
    }
}

export const regxcheck = (value: string, field: string ) => {
    const result = {
        isValid: true,
        errorMsg: '',
    };
    if (!REGEX_MAPPING[field as keyof typeof REGEX_MAPPING].test(value)) {
        result.isValid = false;
        result.errorMsg = `Invalid ${field} format`;
    }
    return result;
};

export const checkModelInMapping = (model: string) => {
    if (!model) {
        throw new DbError('model is requried for the process');
    }

   if (!Object.keys(modelMapping).includes(model)) {
    throw new DbError('model used is incorrect, not in mapping');
   }
};

export const createCommonMetaDataForListing = (values: any) => {
    const { count = 0, limit = 10 , page = 1 } = values;
    return {
        pages: Math.ceil(count/limit),
        limit,
        totalCount: count,
        page,
    }
}

export const deepCopy = (obj: any) => {
    return structuredClone(obj);
}

export const applyPrecision = (value: number, precision: number = 2) => {
    // return roundToPrecision(value, precision);
}

export const validateFieldResponse = (values: any, field: Field) => {
    const { label, type, mandatory, options, systemKey, key } = field;

    const isSystemField = !!systemKey;
    const fieldValue = values.fieldResponses[key || ''];
    if (field.systemKey === 'code' && values.action === ACTIONS.CREATE) {
        return {
            isSystemField: true,
            value: '',
        }
    }
    if (mandatory && values.method === METHODS.SUBMIT && !fieldValue) {
        throw new ValidationError(`Field ${label} is mandatory for submission`);
    }
    if (systemKey === 'price') {
        if (fieldValue && isNaN(Number(fieldValue))) {
            throw new ValidationError(`Field ${label} value must be a number for row ${values.rowNumber}`);
        }
        // Todo: add validation for price
    }
    if (systemKey === 'product') {
        if (!fieldValue) {
            throw new ValidationError(`Field ${label} value is required for row ${values.rowNumber}`);
        }
    }

    if (type === FIELD_TYPES.DATE) {
        // Todo: add validation for date
    }


    return {
        isSystemField,
        value: fieldValue,
    }

}