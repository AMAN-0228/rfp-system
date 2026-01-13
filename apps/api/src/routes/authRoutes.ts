import { Router } from 'express';
import { logoutUser } from '../controllers/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();



router.post('/logout', asyncHandler(logoutUser));

export default router;