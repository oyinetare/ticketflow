import express from "express";
import cors from "cors";
import { v1Routes } from "./api/v1Routes";
import { v2Routes } from "./api/v2Routes";
import errorHandler, { notFoundHandler } from "./middleware/errorHandler";
import { API_CONFIG } from "@ticketflow/shared/types";
import { idempotencyMiddleware } from "./middleware/idempotency";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Apply idempotency middleware to all routes
app.use(idempotencyMiddleware);

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "TicketFlow",
    currentVersion: API_CONFIG.current,
    availableVersions: API_CONFIG.supported,
    deprecationNotice: {
      v1: `Version 1 is deprecated and will be sunset on ${API_CONFIG.sunset.v1}`,
    },
    documentation: {
      v1: "/api/v1",
      v2: "/api/v2",
      // swagger: "/api-docs",
    },
  });
});

app.use("/api/v1", v1Routes);
app.use("/api/v2", v2Routes);

// Redirect /api to current version
app.use("/api", (req, res, next) => {
  if (req.path === "/" || req.path === "") {
    res.redirect(`/api/${API_CONFIG.current}`);
  } else {
    res.redirect(`api/${API_CONFIG.current}${req.path}`);
  }
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`\n TicketFlow server running on http://localhost:${PORT}`);
  console.log("\n Available endpoints:");
  console.log("  GET  /api/v2/events");
  console.log("  GET  /api/v2/events/:id");
  console.log("  POST /api/v2/tickets/purchase");
  console.log("  GET  /api/v2/tickets/:id/status");
  console.log("  GET  /api/v2/tickets/user/:userId");
  console.log("  GET  /api/v2/admin/queue-stats");
  console.log("  GET  /api/v2/health");
  console.log("-----------------------");
  console.log("  GET  /api/v1/events");
  console.log("  GET  /api/v1/events/:id");
  console.log("  POST /api/v1/events");
  console.log("  POST /api/v1/tickets/purchase");
  console.log("  GET  /api/v1/tickets/user/:userId");
});

export default app;
