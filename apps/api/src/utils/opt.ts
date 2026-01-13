import { redisClient } from "../config/redis";
import { ValidationError } from "./errors"
import { redisService } from "../service/redisService";
import { emailService } from "../service/email/emailService";

export const sendOtp = async (email: string) => {
    if (!email) {
        throw new ValidationError('Email is required For Sending OTP');
    }
    const isBlocked = await redisClient.get(`otp:${email}_block`)
    if (isBlocked) {
        throw new ValidationError('Email is blocked for sending OTP. Please try again later.');
    }
    const numberOfAttempts = await redisService.checkAttempts(`otp:${email}_attempts`);

    if (numberOfAttempts >= 3) {
        await redisService.block(`otp:${email}_block`, 15 * 60);
        throw new ValidationError('Email is blocked for sending OTP. Please try again later after 15 minutes.');
    }
    const otpKey = `otp:${email}`;
    const otpAlreadyExists = await redisService.get(otpKey);
    if (otpAlreadyExists) {
        throw new ValidationError('OTP already exists for this email. Please wait for 1 min for trying again.');
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    
    const emailResult = await emailService.sendOtp({ 
      email, 
      otp: otp.toString() 
    });
    
    if (!emailResult.success) {
      throw new ValidationError(
        emailResult.error?.message || 'Failed to send OTP email. Please try again.'
      );
    }
    
    await redisService.set(otpKey, otp.toString(), 60);
    await redisService.set(`otp:${email}_attempts`, (numberOfAttempts + 1).toString(), 5 * 60);
    return otp;
};

export const verifyOtp = async (values: {email: string, otp: string}) => {
    const { email, otp } = values;
    if (!email || !otp) {
        throw new ValidationError('Email and OTP are required for verification');
    }
    const isBlocked = await redisService.checkBlocked(`otp:${email}_block`);
    if (isBlocked) {
        throw new ValidationError('Email is blocked for sending OTP. Please try again later after 15 minutes.');
    }
    const wrongOtpKey = `otp:${email}_wrong_attempts`;
    const numberofWorngAttempts = await redisService.checkAttempts(wrongOtpKey);
    if (numberofWorngAttempts >= 3) {
        await redisService.block(wrongOtpKey, 60 * 60);
        throw new ValidationError('Email is blocked for 3 wrong OTP attempts. Please try again later after h1 hour.');
    }
    const otpKey = `otp:${email}`;
    const storedOtp = await redisService.get(otpKey);
    if (!storedOtp) {
        await redisService.set(wrongOtpKey, (numberofWorngAttempts + 1).toString(), 2* 60);
        throw new ValidationError('OTP has Expired, Please resend OTP.');
    }
    if (storedOtp !== otp) {
        await redisService.set(wrongOtpKey, (numberofWorngAttempts + 1).toString(), 2 * 60);
        throw new ValidationError('Invalid OTP, Please try again.');
    }
    await redisService.delete(otpKey);
    return true;
};