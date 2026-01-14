import { ValidationError } from "./errors";
import { TokenPayload } from "./tokens";
import prisma from "../config/database";
import { REGEX_MAPPING } from "./constant";

export const markActiveAndInactive = async (values: {id: number, active: boolean, userType: 'user' | 'supplier'}, auth: TokenPayload) => {
    const { id, active, userType } = values;
    if (!id || !active || !userType) {
        throw new ValidationError('Id, active and userType are required');
    }
    if (userType === 'user') {
        return await prisma.users.update({
            where: { id },
            data: { active },
        });
    } else if (userType === 'supplier') {
        return await prisma.suppliers.update({
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