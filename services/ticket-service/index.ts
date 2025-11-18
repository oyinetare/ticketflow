import express from "express";
import Redis from "ioredis";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import Bull from "bull";
import { Ticket } from "@ticketflow/shared/types";

const app = express();
app.use(express.json());

// Redis clients
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: 6379,
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();

// Service URLs
const EVENT_SERVICE_URL =
  process.env.EVENT_SERVICE_URL || "http://localhost:3001";
const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:3003";

// Ticket storage (using Redis for this example, could be MongoDB)
class TicketStore {
  async create(ticket: Ticket): Promise<void> {
    await redis.setex(
      `ticket:${ticket.id}`,
      86400, // 24 hours
      JSON.stringify(ticket)
    );

    // Add to user's tickets set
    await redis.sadd(`user:${ticket.userId}:tickets`, ticket.id);
  }

  async get(ticketId: string): Promise<Ticket | null> {
    const data = await redis.get(`ticket:${ticketId}`);
    return data ? JSON.parse(data) : null;
  }

  async updateStatus(
    ticketId: string,
    status: Ticket["status"]
  ): Promise<void> {
    const ticket = await this.get(ticketId);
    if (ticket) {
      ticket.status = status;
      await redis.setex(`ticket:${ticketId}`, 86400, JSON.stringify(ticket));
    }
  }

  async getUserTickets(userId: string): Promise<Ticket[]> {
    const ticketIds = await redis.smembers(`user:${userId}:tickets`);
    const tickets = await Promise.all(ticketIds.map((id) => this.get(id)));
    return tickets.filter((t) => t !== null) as Ticket[];
  }
}

const ticketStore = new TicketStore();

// Reservation queue for expired reservations
const reservationQueue = new Bull("ticket-reservations", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379,
  },
});

// Process expired reservations
reservationQueue.process(async (job) => {
  const { ticketId, eventId } = job.data;

  const ticket = await ticketStore.get(ticketId);
  if (ticket && ticket.status === "reserved") {
    // Release the ticket back to inventory
    await ticketStore.updateStatus(ticketId, "cancelled");

    // Call event service to release ticket
    await axios.post(`${EVENT_SERVICE_URL}/events/${eventId}/release`, {
      quantity: 1,
    });

    console.log(`Released expired reservation for ticket ${ticketId}`);
  }
});

// API Routes
app.post("/tickets/purchase", async (req, res) => {
  const { eventId, userId, idempotencyKey } = req.body;

  // Check for duplicate request
  const existing = await redis.get(`idempotent:${idempotencyKey}`);
  if (existing) {
    return res.json(JSON.parse(existing));
  }

  try {
    // Step 1: Reserve ticket from event service
    const reserveResponse = await axios.post(
      `${EVENT_SERVICE_URL}/events/${eventId}/reserve`,
      { quantity: 1 }
    );

    if (!reserveResponse.data.success) {
      return res.status(409).json({ error: "No tickets available" });
    }

    const event = reserveResponse.data.event;

    // Step 2: Create ticket
    const ticket: Ticket = {
      id: uuidv4(),
      eventId,
      userId,
      purchaseDate: new Date(),
      price: event.price,
      status: "reserved",
    };

    await ticketStore.create(ticket);

    // Step 3: Set expiration for reservation (5 minutes)
    await reservationQueue.add(
      { ticketId: ticket.id, eventId },
      { delay: 5 * 60 * 1000 } // 5 minutes
    );

    // Step 4: Initiate payment
    await pubClient.publish(
      "ticket:reserved",
      JSON.stringify({
        ticketId: ticket.id,
        eventId: ticket.eventId,
        userId: ticket.userId,
        amount: ticket.price,
      })
    );

    const response = {
      ticket,
      message: "Ticket reserved. Payment processing initiated.",
    };

    // Store idempotent response
    await redis.setex(
      `idempotent:${idempotencyKey}`,
      3600,
      JSON.stringify(response)
    );

    res.json(response);
  } catch (error: any) {
    console.error("Ticket purchase error:", error.message);

    // If we failed after reserving, release the ticket
    if (error.response?.status !== 409) {
      try {
        await axios.post(`${EVENT_SERVICE_URL}/events/${eventId}/release`, {
          quantity: 1,
        });
      } catch (releaseError) {
        console.error("Failed to release ticket:", releaseError);
      }
    }

    res.status(500).json({ error: "Failed to purchase ticket" });
  }
});

app.get("/tickets/:id", async (req, res) => {
  try {
    const ticket = await ticketStore.get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

app.get("/users/:userId/tickets", async (req, res) => {
  try {
    const tickets = await ticketStore.getUserTickets(req.params.userId);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user tickets" });
  }
});

// Subscribe to payment events
subClient.subscribe("payment:completed");
subClient.subscribe("payment:failed");

subClient.on("message", async (channel, message) => {
  const data = JSON.parse(message);

  if (channel === "payment:completed") {
    await ticketStore.updateStatus(data.ticketId, "confirmed");
    console.log(`Ticket ${data.ticketId} confirmed after payment`);
  } else if (channel === "payment:failed") {
    const ticket = await ticketStore.get(data.ticketId);
    if (ticket) {
      await ticketStore.updateStatus(data.ticketId, "cancelled");
      // Release ticket back to inventory
      await axios.post(
        `${EVENT_SERVICE_URL}/events/${ticket.eventId}/release`,
        {
          quantity: 1,
        }
      );
      console.log(`Ticket ${data.ticketId} cancelled after payment failure`);
    }
  }
});

// Health check
app.get("/health", async (req, res) => {
  try {
    await redis.ping();
    res.json({
      service: "ticket-service",
      status: "healthy",
      redis: "connected",
    });
  } catch (error) {
    res.status(503).json({
      service: "ticket-service",
      status: "unhealthy",
      redis: "disconnected",
    });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Ticket Service running on port ${PORT}`);
});
