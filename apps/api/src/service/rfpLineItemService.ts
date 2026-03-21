import * as lineItemRepository from "../repositories/lineItemRepository";
import { runInTransaction } from "../repositories/transactionRunner";
import { deepCopy, validateFieldResponse } from "../utils/common";
import type { TransactionClient } from "../repositories/types";
import { ACTIONS, SECTION_TYPES } from "../utils/constant";
import { ValidationError } from "../utils/errors";
import { TokenPayload } from "../utils/tokens";

export const validateLineItems = (values: any) => {
    const {
        fields,
        fieldOrder,
        method,
        action,
        rows,
        rowOrder,
    } = values;

    const lineItems: any[] = [];

    if (!rowOrder || rowOrder.length === 0) {
        throw new ValidationError(`Row order is required`);
    }
    if (!rows || rows.length === 0) {
        throw new ValidationError(`Rows are required`);
    }

    if (rowOrder.length !== rows.length) {
        throw new ValidationError(`Row order and rows length mismatch`);
    }

    const deletedItems: number[] = [];
    rowOrder.forEach((rowKey: string, index: number) => {
        const row = rows[rowKey];
        if (!row) {
            throw new ValidationError(`Row ${rowKey} data not found`);
        }
        if (row.action === ACTIONS.DElETE || row.action === ACTIONS.EDIT) {
            if (!row.id) {
                throw new ValidationError(`Row ${rowKey} id is required for delete`);
            }
        }
        if (row.action === ACTIONS.DElETE) {
            if (['in-progress', 'completed', 'cancelled'].includes(row.status) )
                throw new ValidationError(`Row ${rowKey} status is not allowed for delete`);
            deletedItems.push(row.id);

        } else {
            const obj: any = {
                id: row.id || null,
                sno: row.sno,
                status: row.status || 'pending',
                fieldResponses: {},
                key: row.key,
            }
            fields.forEach((field: any) => {
                const {isSystemField, value} = validateFieldResponse({
                    method,
                    action,
                    fieldResponses: row.fieldResponses,
                }, field)
                if (isSystemField) {
                    obj[field.systemKey || ''] = value;
                } else {
                    obj.fieldResponses[field.key || ''] = value;
                }
            })
            lineItems.push(deepCopy(obj));
        }
        
    })

    return {
        rows: lineItems,
        deletedItems,
    };
}



export const lineItemsUpdate = async (
    rfpId: number,
    values: any,
    auth: TokenPayload,
    tx?: TransactionClient
) => {
    const lineItemsPayload = values?.rows ? values : values?.lineItems;
    if (!rfpId || !lineItemsPayload) {
        throw new ValidationError('Rfp id and line items are required');
    }
    const rows = lineItemsPayload.rows ?? lineItemsPayload;
    const deletedItems = lineItemsPayload.deletedItems ?? [];

    const existingLineItems = await lineItemRepository.findManyByRfpId(rfpId, tx);

    if (values.action !== ACTIONS.CREATE && !(existingLineItems.length > 0)) {
        throw new ValidationError('Line items not found for this RFP');
    }

    const existingLineItemsMap = new Map(existingLineItems.map((item: any) => [item.id, item]));
    const newLineItems: any[] = [];
    const toBeUpdatedLineItems: any[] = [];
    (Array.isArray(rows) ? rows : []).forEach((item: any) => {
        if (item.action === ACTIONS.CREATE)
            newLineItems.push(item);
        else if (item.action === ACTIONS.EDIT) {
            const existingItem = existingLineItemsMap.get(item.id);
            if (existingItem) {
                toBeUpdatedLineItems.push(item);
            } else {
                throw new ValidationError(`Line item ${item.id} not found`);
            }
        }
    })

    if (newLineItems.length > 0) {
        await lineItemRepository.createMany(rfpId, newLineItems, tx);
    }

    if (toBeUpdatedLineItems.length > 0) {
        if (tx) {
            await lineItemRepository.updateManyInTransaction(toBeUpdatedLineItems, tx);
        } else {
            await runInTransaction(async (innerTx) => {
                await lineItemRepository.updateManyInTransaction(toBeUpdatedLineItems, innerTx);
            });
        }
    }

    if (deletedItems.length > 0) {
        await lineItemRepository.markDeleted(deletedItems, tx);
    }
}