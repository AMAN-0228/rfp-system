import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { registerUser, verifyOtpForRegistrationForUser, loginUser, forgotPasswordForUser, forgotPasswordVerifyOtpForUser, resetPasswordForUser } from '../controllers/userAuth';

const router = Router();

router.post('/register', asyncHandler(registerUser));

router.post('/verify-otp-for-registration', asyncHandler(verifyOtpForRegistrationForUser));

router.post('/login', asyncHandler(loginUser));
router.post('/forgot-password', asyncHandler(forgotPasswordForUser));
router.post('/forgot-password-verify-otp', asyncHandler(forgotPasswordVerifyOtpForUser));
router.post('/reset-password', asyncHandler(resetPasswordForUser));

export default router;