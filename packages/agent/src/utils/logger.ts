import { createLoggerObserver, createPinoLogger } from "@anvia/logger";

const logger = createPinoLogger({
  level: "debug",
  name: "support-logger",
  pinoOptions: {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid, hostname",
      },
    },
  },
});

export const observer = createLoggerObserver(logger);
