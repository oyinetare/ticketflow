import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { EventService } from "../services/eventService";
import { TicketService } from "../services/ticketService";
import { LockService } from "../services/lockService";
import { paymentQueue } from "../queues/paymentQueue";

const v2Routes = Router();

v2Routes.get("/", (req, res) => {
  res.json({
    version: "2.0.0",
    status: "current",
    endpoints: {
      events: {
        list: "GET /api/v2/events",
        create: "POST /api/v2/events",
        get: "GET /api/v2/events/:id ",
      },
      tickets: {
        purchase: "POST /api/v2/tickets/purchase",
        status: "GET /api/v2/tickets/:id/status",
        get: "GET /api/v2/tickets/user/:userId",
        "queue-stats": "GET /api/v2/admin/queue-stats",
        health: "GET /api/v2/health",
      },
    },
    features: {
      pagination: true,
      filtering: true,
      sorting: true,
      idempotency: true,
      locking: true,
      queues: true,
      //   batch_operations: true,
      //   webhooks: true,
    },
  });
});

const eventService = new EventService();
const ticketService = new TicketService();
const lockService = new LockService();

// Event Routes (same as before)
v2Routes.get("/events", async (req: Request, res: Response) => {
  try {
    const events = await eventService.getAllEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

v2Routes.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// IMPROVED Ticket Purchase Route with distributed locking
v2Routes.post("/tickets/purchase", async (req: Request, res: Response) => {
  const { eventId, userId } = req.body;
  const lockIdentifier = uuidv4();
  const idempotencyKey = (req as any).idempotencyKey;

  // Acquire lock for this event
  const lockKey = `event:${eventId}:inventory`;
  const lockAcquired = await lockService.waitForLock(
    lockKey,
    lockIdentifier,
    5000
  );

  if (!lockAcquired) {
    return res.status(503).json({
      error: "Service temporarily unavailable. Please try again.",
    });
  }

  try {
    console.log(`User ${userId} acquired lock for event ${eventId}`);

    // Check event availability (now protected by lock!)
    const event = await eventService.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.availableTickets <= 0) {
      return res.status(400).json({ error: "No tickets available" });
    }

    console.log(
      `Available tickets: ${event.availableTickets} (with lock protection)`
    );

    // Create ticket and immediately decrease inventory
    const ticket = await ticketService.createTicket(
      eventId,
      userId,
      event.price
    );
    await eventService.updateEventTickets(eventId, event.availableTickets - 1);

    // Queue payment processing (async)
    await paymentQueue.add(
      {
        ticketId: ticket.id,
        eventId: eventId,
        userId: userId,
        amount: event.price,
        idempotencyKey: idempotencyKey,
      },
      {
        delay: 0,
        attempts: 3,
      }
    );

    console.log(
      `Ticket ${ticket.id} created and payment queued for user ${userId}`
    );

    res.status(202).json({
      ticket,
      message: "Ticket reserved. Payment is being processed.",
      status: "processing",
    });
  } catch (error: any) {
    console.error("Purchase failed:", error.message);
    res
      .status(500)
      .json({ error: error.message || "Failed to purchase ticket" });
  } finally {
    // Always release the lock
    await lockService.releaseLock(lockKey, lockIdentifier);
    console.log(`Lock released for event ${eventId}`);
  }
});

// Check ticket status (including payment status)
v2Routes.get("/tickets/:id/status", async (req: Request, res: Response) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Check if payment is complete
    const paymentService = await import("../services/paymentService").then(
      (m) => new m.PaymentService()
    );
    const payment = await paymentService.getPaymentByTicketId(ticket.id);

    res.json({
      ticket,
      payment,
      status: payment?.status === "completed" ? "confirmed" : ticket.status,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ticket status" });
  }
});

// Get user's tickets
v2Routes.get("/tickets/user/:userId", async (req: Request, res: Response) => {
  try {
    const tickets = await ticketService.getTicketsByUserId(req.params.userId);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Queue monitoring endpoint
v2Routes.get("/admin/queue-stats", async (req: Request, res: Response) => {
  try {
    const waiting = await paymentQueue.getWaitingCount();
    const active = await paymentQueue.getActiveCount();
    const completed = await paymentQueue.getCompletedCount();
    const failed = await paymentQueue.getFailedCount();

    res.json({
      queue: "payment-processing",
      stats: {
        waiting,
        active,
        completed,
        failed,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue stats" });
  }
});

// Health check
v2Routes.get("/health", async (req: Request, res: Response) => {
  try {
    // Check Redis connection
    const lockTest = await lockService.acquireLock("health-check", "test");
    if (lockTest) {
      await lockService.releaseLock("health-check", "test");
    }

    res.json({
      status: "ok",
      timestamp: new Date(),
      services: {
        api: "healthy",
        redis: lockTest ? "healthy" : "unhealthy",
        queue: "healthy",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      timestamp: new Date(),
      services: {
        api: "healthy",
        redis: "unhealthy",
        queue: "unknown",
      },
    });
  }
});

export { v2Routes };
