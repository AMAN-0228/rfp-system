import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { registerUser, verifyOtpForRegistrationForUser, loginUser } from '../controllers/userAuth';

const router = Router();

router.post('/register', asyncHandler(registerUser));

router.post('/verify-otp-for-registration', asyncHandler(verifyOtpForRegistrationForUser));

router.post('/login', asyncHandler(loginUser));

export default router;