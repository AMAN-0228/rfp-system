import { Request, Response } from 'express';
import { register, verifyingOtpForRegistration } from '../utils/registration';
import { login } from '../utils/auth';
import { ValidationError } from '../utils/errors';
import { refreshTokens } from '../utils/tokens';

export const registerUser = async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    await register({ name, email, password }, 'user');
    res.status(201).json({ success: true, message: 'OTP sent to email for verification' });
};

export const verifyOtpForRegistrationForUser = async (req: Request, res: Response) => {
    const { name, email, password, otp } = req.body;
    await verifyingOtpForRegistration({ name, email, password, otp }, 'user');
    res.status(201).json({ success: true, message: 'User registered successfully' });
};

export const loginUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const { tokens, user } = await login(email, password);
    res.status(200)
        .cookie('accessToken', tokens.accessToken, { 
            httpOnly: true, // Prevents JavaScript access (XSS protection)
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            maxAge: 15 * 60 * 1000 // 15 minutes (matches access token expiry)
        })
        .cookie('refreshToken', tokens.refreshToken, { 
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches refresh token expiry)
        })
        .json({ success: true, message: 'User logged in successfully', user });
};

export const refreshToken = async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    
    if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
    }
    
    const newTokens = await refreshTokens(refreshToken);
    
    res.status(200)
        .cookie('accessToken', newTokens.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 15 * 60 * 1000 // 15 minutes
        })
        .cookie('refreshToken', newTokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        })
        .json({
            success: true,
            message: 'Tokens refreshed successfully',
            tokens: newTokens
        });
};

export const logoutUser = async (req: Request, res: Response) => {
    res.status(200)
        .clearCookie('accessToken')
        .clearCookie('refreshToken')
        .json({ success: true, message: 'User logged out successfully' });
};