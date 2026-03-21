import { Router } from 'express';
import { logoutUser, resetPasswordForUser, userProfile } from '../controllers/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();



router.post('/logout', asyncHandler(logoutUser));
router.post('/update-password', asyncHandler(resetPasswordForUser));
router.get('/profile/:id', asyncHandler(userProfile));
export default router;