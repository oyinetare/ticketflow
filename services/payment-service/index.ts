import express from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import Bull from "bull";
import { v4 as uuidv4 } from "uuid";
import { Payment } from "@ticketflow/shared/types";

const app = express();
app.use(express.json());

// PostgreSQL for payment records
const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  database: "payments",
  user: "postgres",
  password: "postgres",
  port: 5433, // Different port for payment DB
});

// Redis for pub/sub
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: 6379,
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();

// Payment processing queue
const paymentQueue = new Bull("payment-processing", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379,
  },
});

// Initialize database
async function initDB() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY,
        ticket_id UUID NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_ticket_id ON payments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    `);
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Simulate payment gateway
async function processWithPaymentGateway(payment: Payment): Promise<boolean> {
  // Simulate processing time
  await new Promise((resolve) =>
    setTimeout(resolve, Math.random() * 3000 + 1000)
  );

  // 90% success rate
  return Math.random() > 0.1;
}

// Process payment jobs
paymentQueue.process(async (job) => {
  const { ticketId, userId, amount } = job.data;
  console.log(`Processing payment for ticket ${ticketId}`);

  const paymentId = uuidv4();

  try {
    // Create payment record
    await db.query(
      `INSERT INTO payments (id, ticket_id, user_id, amount, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [paymentId, ticketId, userId, amount, "processing"]
    );

    // Process with payment gateway
    const success = await processWithPaymentGateway({
      id: paymentId,
      ticketId,
      userId,
      amount,
      status: "processing",
      createdAt: new Date(),
    });

    if (success) {
      // Update payment status
      await db.query(
        `UPDATE payments 
         SET status = 'completed', processed_at = NOW()
         WHERE id = $1`,
        [paymentId]
      );

      // Publish success event
      await pubClient.publish(
        "payment:completed",
        JSON.stringify({
          paymentId,
          ticketId,
          userId,
          amount,
        })
      );

      console.log(`Payment ${paymentId} completed successfully`);
    } else {
      throw new Error("Payment gateway declined transaction");
    }
  } catch (error: any) {
    console.error(`Payment ${paymentId} failed:`, error.message);

    // Update payment status
    await db.query(
      `UPDATE payments 
       SET status = 'failed', processed_at = NOW(), metadata = $2
       WHERE id = $1`,
      [paymentId, { error: error.message }]
    );

    // Publish failure event
    await pubClient.publish(
      "payment:failed",
      JSON.stringify({
        paymentId,
        ticketId,
        userId,
        error: error.message,
      })
    );

    throw error;
  }
});

// Subscribe to ticket events
subClient.subscribe("ticket:reserved");

subClient.on("message", async (channel, message) => {
  if (channel === "ticket:reserved") {
    const data = JSON.parse(message);
    console.log("Received ticket reservation:", data);

    // Add to payment queue
    await paymentQueue.add(data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    });
  }
});

// API Routes
app.post("/payments", async (req, res) => {
  const { ticketId, userId, amount } = req.body;

  try {
    // Add to payment queue
    const job = await paymentQueue.add(
      { ticketId, userId, amount },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    res.status(202).json({
      message: "Payment processing initiated",
      jobId: job.id,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

app.get("/payments/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM payments WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

app.get("/payments/ticket/:ticketId", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM payments WHERE ticket_id = $1 ORDER BY created_at DESC",
      [req.params.ticketId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

app.get("/users/:userId/payments", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC",
      [req.params.userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user payments" });
  }
});

// Health check
app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    await redis.ping();

    res.json({
      service: "payment-service",
      status: "healthy",
      database: "connected",
      redis: "connected",
    });
  } catch (error) {
    res.status(503).json({
      service: "payment-service",
      status: "unhealthy",
    });
  }
});

const PORT = process.env.PORT || 3003;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Payment Service running on port ${PORT}`);
  });
});
