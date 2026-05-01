import { ValidationError } from "./errors";
import * as userRepository from "../repositories/userRepository";
import { sendOtp, verifyOtp } from "./opt";
import { env } from "../config/env";
import { hashPassword } from "./password";

export const register =  async (values: { name:string, email: string; password: string }, userType: 'user' | 'supplier') => {
    const { name, email, password} = values;
    if (!name || !email || !password) {
        throw new ValidationError('Name, email and password are required');
    }
    const existingUser = await userRepository.findFirst({
        where: { email },
    });
    if (existingUser) {
        throw new ValidationError('User already exists');
    }
    // opt send for email verification 
    await sendOtp(email);
};

export const verifyingOtpForRegistration = async (values: { name:string, email: string; password: string; otp: string }, userType: 'user' | 'supplier') => {
    const { name, email, password, otp } = values;
    if (!name || !email || !password || !otp) {
        throw new ValidationError('Name, email, password and OTP are required for verification');
    }
    const isVerified = await verifyOtp({ email, otp });
    if (!isVerified) {
        throw new ValidationError('Invalid OTP, Please try again.');
    }

    const hashedPassword = await hashPassword(password);

    if (userType === 'user') {
        await userRepository.create({
            data: {
                email,
                password: hashedPassword,
                name: name || null,
            },
        });
    } else {
        // TODO: Implement supplier registration
        throw new ValidationError('Supplier registration is not implemented yet');
    }
};