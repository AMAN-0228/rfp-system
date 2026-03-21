import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { createNew, getAllRfpForListing } from '../controllers/rfpController';

const router = Router();

router.get('/', asyncHandler(getAllRfpForListing));
router.post('/', asyncHandler(createNew));
// router.post('/:id/edit', asyncHandler(edit));

export default router;
