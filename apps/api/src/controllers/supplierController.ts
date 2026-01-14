import { Request, Response } from 'express';
import { markActiveAndInactive } from '../utils/common';
import * as supplierService from '../service/supplierService';

export const getAllSuppliersForListing = async(req: Request, res: Response) => {
    // TODO: Implement this function

}

export const createSupplier = async(req: Request, res: Response) => {
    const createdSupplier = await supplierService.create({...req.body, action: 'create'}, req.auth!);
    res.status(200)
        .json({
            success: true,
            message: 'Supplier created successfully',
            data: createdSupplier,
        });
}

export const editSupplier = async(req: Request, res: Response) => {
    const editedSupplier = await supplierService.edit({...req.body, action: 'edit'}, req.auth!);
    res.status(200)
        .json({
            success: true,
            message: 'Supplier edited successfully',
            data: editedSupplier,
        });
}

export const activeAndInactiveSupplier = async (req: Request, res: Response) => {
    const { supplierId } = req.params;
    const updatedSupplier = await markActiveAndInactive({id: Number(supplierId), active: req.body.active, userType: 'supplier' }, req.auth!);
    res.status(200)
        .json({
            success: true,
            message: updatedSupplier?`Supplier is marked as ${updatedSupplier.active ?'active': 'inactive' } successfully`:'Supplier activation status is updated successfully',
            data: updatedSupplier,
        });
}

export const deleteSupplier = async (req: Request, res: Response) => {

}

export const getSupplierForView = async (req: Request, res: Response) => {
   const { supplierId } = req.params;
   const supplier = await supplierService.getSupplierForView(Number(supplierId), req.auth!);
   res.status(200)
    .json({
        success: true,
        message: 'Supplier fetched successfully',
        data: supplier,
   });
}