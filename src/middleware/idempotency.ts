import { Request, Response, NextFunction } from "express";
import { IdempotencyService } from "../services/idempotencyService";

const idempotencyService = new IdempotencyService();

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only apply to POST requests with idempotency key
  if (req.method !== "POST") {
    return next();
  }

  const idempotencyKey =
    (req.headers["idempotency-key"] as string) ||
    idempotencyService.generateIdempotencyKey(req);

  // Check for cached response
  const cachedResponse = await idempotencyService.getIdempotentResponse(
    idempotencyKey
  );
  if (cachedResponse) {
    console.log(
      `Returning cached response for idempotency key: ${idempotencyKey}`
    );
    return res.status(cachedResponse.status).json(cachedResponse.data);
  }

  // Store the original json method
  const originalJson = res.json.bind(res);

  // Override json method to cache the response
  res.json = function (data: any) {
    idempotencyService
      .storeIdempotentResponse(idempotencyKey, {
        status: res.statusCode,
        data,
      })
      .catch((err) => console.error("Error caching idempotent response:", err));

    return originalJson(data);
  };

  // Attach idempotency key to request for use in handlers
  (req as any).idempotencyKey = idempotencyKey;

  next();
};
