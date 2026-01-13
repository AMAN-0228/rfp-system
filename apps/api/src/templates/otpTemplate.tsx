
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';


interface OtpTemplateProps {
  otp: string;
  email?: string;
}


export const OtpTemplate = ({ otp, email }: OtpTemplateProps) => {
  return (
    <Html>
      <Head />
      
      <Preview>Your OTP code for RFP System</Preview>
      
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Verification Code</Heading>
          
          <Text style={text}>
            Your one-time password (OTP) for {email || 'your account'} is:
          </Text>
          
          <Section style={codeContainer}>
            <Text style={code}>{otp}</Text>
          </Section>
          
          {/* Expiration notice */}
          <Text style={text}>
            This code will expire in 60 seconds. Please do not share this code with anyone.
          </Text>
          
          {/* Security footer */}
          <Text style={footer}>
            If you didn't request this code, please ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default OtpTemplate;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const, // TypeScript needs 'as const' for literal types
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'center' as const,
  margin: '0 0 16px',
};

const codeContainer = {
  background: '#f4f4f4',
  borderRadius: '4px',
  margin: '32px auto',
  padding: '24px',
  textAlign: 'center' as const,
  width: '280px',
};

const code = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'monospace', // Fixed-width font for numbers
  fontSize: '32px', // Large size for visibility
  fontWeight: 'bold',
  letterSpacing: '8px', // Space between digits
  lineHeight: '40px',
  textAlign: 'center' as const,
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '32px',
  textAlign: 'center' as const,
};
