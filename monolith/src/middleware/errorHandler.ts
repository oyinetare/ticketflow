import { Request, Response, NextFunction } from "express";
import { API_CONFIG } from "@ticketflow/shared/types";
// import { logger } from "./requestLogger";

export const notFoundHandler = (req: Request, res: Response) => {
  //   logger.warn("404 - Not Found", {
  //     method: req.method,
  //     url: req.url,
  //     ip: req.ip,
  //   });

  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found",
      availableVersions: API_CONFIG.supported.map((v) => `/api/${v}`),
    },
  });
};

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err.stack);
  //   logger.error("Unhandled error", {
  //     error: err.message,
  //     stack: err.stack,
  //     url: req.url,
  //     method: req.method,
  //   });

  // check response already sent
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      timestamp: new Date().toISOString(),
    },
  });
};

export default errorHandler;
