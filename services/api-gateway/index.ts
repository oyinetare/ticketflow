import express from "express";
import {
  createProxyMiddleware,
  Options as ProxyOptions,
} from "http-proxy-middleware";
import axios from "axios";
import CircuitBreaker from "opossum";
import { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

// Service URLs
const services = {
  event: process.env.EVENT_SERVICE_URL || "http://localhost:3001",
  ticket: process.env.TICKET_SERVICE_URL || "http://localhost:3002",
  payment: process.env.PAYMENT_SERVICE_URL || "http://localhost:3003",
};

// Circuit breaker options
const breakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

// Create circuit breakers for each service
const breakers = {
  event: new CircuitBreaker((url: string) => axios.get(url), breakerOptions),
  ticket: new CircuitBreaker(
    (url: string, data?: any) =>
      data ? axios.post(url, data) : axios.get(url),
    breakerOptions
  ),
  payment: new CircuitBreaker((url: string) => axios.get(url), breakerOptions),
};

// Logging middleware
app.use((req, res, next) => {
  console.log(
    `[Gateway] ${new Date().toISOString()} - ${req.method} ${req.path}`
  );
  next();
});

// Health check aggregator
app.get("/health", async (req, res) => {
  const healthChecks = await Promise.allSettled([
    axios
      .get(`${services.event}/health`)
      .catch((e) => ({ status: "unhealthy", error: e.message })),
    axios
      .get(`${services.ticket}/health`)
      .catch((e) => ({ status: "unhealthy", error: e.message })),
    axios
      .get(`${services.payment}/health`)
      .catch((e) => ({ status: "unhealthy", error: e.message })),
  ]);

  const health = {
    gateway: "healthy",
    services: {
      event: healthChecks[0].status === "fulfilled" ? "healthy" : "unhealthy",
      ticket: healthChecks[1].status === "fulfilled" ? "healthy" : "unhealthy",
      payment: healthChecks[2].status === "fulfilled" ? "healthy" : "unhealthy",
    },
    timestamp: new Date(),
  };

  const allHealthy = Object.values(health.services).every(
    (status) => status === "healthy"
  );
  res.status(allHealthy ? 200 : 503).json(health);
});

// Event service routes
// Custom interface that extends the base options
interface CustomProxyOptions extends ProxyOptions {
  onProxyError?: (err: any, req: any, res: any) => void;
}
const eventProxyOptions: CustomProxyOptions = {
  target: services.event,
  changeOrigin: true,
  pathRewrite: {
    "^/api/events": "/events",
  },
  onProxyError: (err, req, res) => {
    console.error("Event service error:", err);
    res.status(503).json({ error: "Event service unavailable" });
  },
};

app.use("/api/events", createProxyMiddleware(eventProxyOptions));

// Ticket purchase endpoint (orchestration)
app.post("/api/tickets/purchase", async (req, res) => {
  const { eventId, userId } = req.body;
  const idempotencyKey =
    req.headers["idempotency-key"] || `${userId}-${eventId}-${Date.now()}`;

  try {
    // Call ticket service
    const response = await axios.post(`${services.ticket}/tickets/purchase`, {
      eventId,
      userId,
      idempotencyKey,
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Purchase orchestration error:", error.message);

    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ error: "Service unavailable" });
    }
  }
});

// Ticket status with payment info (aggregation)
app.get("/api/tickets/:id/full-status", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch ticket and payment info in parallel
    const [ticketResponse, paymentResponse] = await Promise.allSettled([
      axios.get(`${services.ticket}/tickets/${id}`),
      axios.get(`${services.payment}/payments/ticket/${id}`),
    ]);

    const response: any = {
      ticket: null,
      payments: [],
    };

    if (ticketResponse.status === "fulfilled") {
      response.ticket = ticketResponse.value.data;
    }

    if (paymentResponse.status === "fulfilled") {
      response.payments = paymentResponse.value.data;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ticket status" });
  }
});

// User tickets route
const userTicketsProxyOptions: CustomProxyOptions = {
  target: services.ticket,
  changeOrigin: true,
  pathRewrite: (path) => path.replace("/api/", "/"),
  onProxyError: (err, req, res) => {
    console.error("Ticket service error:", err);
    res.status(503).json({ error: "Ticket service unavailable" });
  },
};

app.use(
  "/api/users/:userId/tickets",
  createProxyMiddleware(userTicketsProxyOptions)
);

// User payments route
const userPaymentsProxyOptions: CustomProxyOptions = {
  target: services.payment,
  changeOrigin: true,
  pathRewrite: (path) => path.replace("/api/", "/"),
  onProxyError: (err, req, res) => {
    console.error("Payment service error:", err);
    res.status(503).json({ error: "Payment service unavailable" });
  },
};

app.use(
  "/api/users/:userId/payments",
  createProxyMiddleware(userPaymentsProxyOptions)
);

// Circuit breaker status endpoint
app.get("/api/circuit-breakers", (req, res) => {
  res.json({
    event: {
      state: breakers.event.opened ? "open" : "closed",
      stats: breakers.event.stats,
    },
    ticket: {
      state: breakers.ticket.opened ? "open" : "closed",
      stats: breakers.ticket.stats,
    },
    payment: {
      state: breakers.payment.opened ? "open" : "closed",
      stats: breakers.payment.stats,
    },
  });
});

// Error handling
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Gateway error:", err);
    res.status(500).json({ error: "Internal gateway error" });
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌐 API Gateway running on port ${PORT}`);
  console.log("\n📍 Service endpoints:");
  console.log(`  - Event Service: ${services.event}`);
  console.log(`  - Ticket Service: ${services.ticket}`);
  console.log(`  - Payment Service: ${services.payment}`);
  console.log("\n🔗 Available routes:");
  console.log("  GET  /health");
  console.log("  GET  /api/events");
  console.log("  GET  /api/events/:id");
  console.log("  POST /api/tickets/purchase");
  console.log("  GET  /api/tickets/:id/full-status");
  console.log("  GET  /api/users/:userId/tickets");
  console.log("  GET  /api/users/:userId/payments");
  console.log("  GET  /api/circuit-breakers\n");
});
