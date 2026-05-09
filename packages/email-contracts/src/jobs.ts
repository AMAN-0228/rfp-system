import { z } from "zod";

export const SendOtpJob = z.object({
  type: z.literal("send_otp"),
  idempotencyKey: z.string(),
  to: z.string().email(),
  otp: z.string(),
  userId: z.number().optional(),
});

export const SendRfpInvitationJob = z.object({
  type: z.literal("send_rfp_invitation"),
  idempotencyKey: z.string(),
  rfpId: z.number(),
  supplierId: z.number(),
  rfpSupplierId: z.number(),
  to: z.string().email(),
  replyToken: z.string(),
  rfpCode: z.string(),
  rfpSubject: z.string(),
  senderUserName: z.string().optional(),
});

export const SendResponseConfirmedJob = z.object({
  type: z.literal("send_response_confirmed"),
  idempotencyKey: z.string(),
  rfpId: z.number(),
  supplierId: z.number(),
  to: z.string().email(),
  rfpSubject: z.string(),
});

export const TestSendJob = z.object({
  type: z.literal("test_send"),
  idempotencyKey: z.string(),
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
});

export const OutboundJob = z.discriminatedUnion("type", [
  SendOtpJob,
  SendRfpInvitationJob,
  SendResponseConfirmedJob,
  TestSendJob,
]);
export type OutboundJob = z.infer<typeof OutboundJob>;

export const ProcessInboundJob = z.object({
  type: z.literal("process_inbound"),
  inboundEmailId: z.number(),
});
export type ProcessInboundJob = z.infer<typeof ProcessInboundJob>;
