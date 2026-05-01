import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { activeAndInactiveSupplier, createSupplier, deleteSupplier, editSupplier, getAllSuppliersForListing, getSupplierForView } from '../controllers/supplierController';

const router = Router();

router.get('/', asyncHandler(getAllSuppliersForListing));
router.post('/', asyncHandler(createSupplier));
router.post('/:supplierId/edit', asyncHandler(editSupplier));
router.post('/:supplierId/active-inactive', asyncHandler(activeAndInactiveSupplier));
router.delete('/:supplierId', asyncHandler(deleteSupplier));
router.get('/:supplierId', asyncHandler(getSupplierForView));

export default router;