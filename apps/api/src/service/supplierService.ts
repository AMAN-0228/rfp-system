import prisma from "../config/database";
import { regxcheck } from "../utils/common";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { TokenPayload } from "../utils/tokens";

type Action = 'create' | 'edit' | 'delete';

const generateCode = async () => {
    // to
    // generate code for supplier
    // code should be unique
    // code is = SP-2 digits of current year-100+ supplier row on the table
}

const accessCheckForAction = (action: Action, creatorId: number, auth: TokenPayload) => {
    if (['edit', 'delete'].includes(action) && auth.userId !== creatorId) {
        throw new ForbiddenError('You are not authorized to perform this action');
    }
}

const createObj = (data: any, userId: number) => {
    if (!data) {
        throw new ValidationError('Data is required');
    }

    let obj: any = {};
    obj.name = data.name;
    obj.email = data.email;
    if (data.action === 'create') {
        // obj.code = generateCode() 
        obj.creatorId = userId;
        obj.status = 'created'
    }
    if (data.action === 'edit') {
        // email should be unique, so email should not be changed
        obj.id = data.id;
        // obj.code = data.code;
    }
    return obj;
}

const validateSupplierDataForCreateAndEdit = (data: any, action: 'create' | 'edit') => {
    if (action === 'create' && !data.email) {
        throw new ValidationError('Email is mandatory');
    }
    if (action === 'edit' && (!data.id || !data.code)) {
        throw new ValidationError('Id and code are required');
    }

    // email regx check
    const emailResult = regxcheck(data.email, 'email');
    if (!emailResult.isValid) {
        throw new ValidationError(emailResult.errorMsg);
    }

}


export const create = async (payload: any, auth: TokenPayload) => {

    validateSupplierDataForCreateAndEdit(payload, 'create');
    const obj = createObj(payload, auth.userId);
    
    const existingSupplier = await prisma.suppliers.findFirst({
        where: { email: obj.email },
        select: {
            id: true,
        },
    });
    if (existingSupplier) {
        throw new ConflictError('Supplier with this email already exists');
    }

    return await prisma.suppliers.create({
        data: obj,
    });

}

export const edit = async (payload: any, auth: TokenPayload) => {
    validateSupplierDataForCreateAndEdit(payload, 'edit');
    const obj = createObj(payload, auth.userId);

    const supplier = await prisma.suppliers.findUnique({
        where: { 
            id: obj.id,
            email: obj.email,
        },
        select: {
            id: true,
            creatorId: true,
        },
    });
    if (!supplier) {
        throw new NotFoundError('Supplier with this email and id not found');
    }
    accessCheckForAction('edit', supplier.creatorId, auth);
    return await prisma.suppliers.update({
        where: { id: obj.id },
        data: obj,
    });
}

export const deleteSupplier = async (id: number, auth: TokenPayload) => {
    if (!id) {
        throw new ValidationError('Id is required');
    }
    
    const supplier = await prisma.suppliers.findUnique({
        where: { 
            id,
            status:{
                not: 'deleted',
            },
         },
        select: {
            id: true,
            creatorId: true,
        },
    });
    if (!supplier) {
        throw new NotFoundError('Supplier not found');
    }
    accessCheckForAction('delete', supplier.creatorId, auth);
    return await prisma.suppliers.update({
        where: { id },
        data: {
            active: false,
            status: 'deleted',
        }
    });
}

export const getSupplierForView = async (id: number, auth: TokenPayload) => {
    if (!id) {
        throw new ValidationError('Id is required');
    }
    
    const supplier = await prisma.suppliers.findUnique({
        where: { id },
    });
    if (!supplier) {
        throw new NotFoundError('Supplier not found');
    }
    return supplier;
}