import pino from "pino";
import { env } from "./env";

export const logger = pino(
  { level: env.LOG_LEVEL },
  env.NODE_ENV === "development"
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined
);
