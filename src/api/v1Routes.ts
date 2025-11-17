import { Router, Request, Response } from "express";
import { EventService } from "../services/eventService";
import { TicketService } from "../services/ticketService";
import { PaymentService } from "../services/paymentService";
import { API_CONFIG } from "../types";

const v1Routes = Router();

const eventService = new EventService();
const ticketService = new TicketService();
const paymentService = new PaymentService();

v1Routes.get("/", (req, res) => {
  res.json({
    version: "1.0.0",
    status: "deprecated",
    // sunset: API_CONFIG.sunset.v1,
    endpoints: {
      events: {
        list: "GET  /api/events",
        create: "POST /api/events",
        get: "GET  /api/events/:id ",
      },
      tickets: {
        purchase: "POST /api/tickets/purchase",
        get: "GET  /api/tickets/user/:userId",
      },
    },
  });
});

// Event Routes
v1Routes.get("/events", async (req: Request, res: Response) => {
  try {
    const events = await eventService.getAllEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

v1Routes.get("/events/:id", async (req: Request, res: Response) => {
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

v1Routes.post("/events", async (req: Request, res: Response) => {
  try {
    const event = await eventService.createEvent(req.body);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Ticket Purchase Route (This is where race conditions happen!)
v1Routes.post("/tickets/purchase", async (req: Request, res: Response) => {
  const { eventId, userId } = req.body;

  try {
    console.log(
      `User ${userId} attempting to purchase ticket for event ${eventId}`
    );

    // Step 1: Check event availability (RACE CONDITION HERE!)
    const event = await eventService.getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.availableTickets <= 0) {
      return res.status(400).json({ error: "No tickets available" });
    }

    console.log(`Available tickets: ${event.availableTickets}`);

    // Step 2: Create ticket
    const ticket = await ticketService.createTicket(
      eventId,
      userId,
      event.price
    );

    // Step 3: Process payment (SLOW - causes problems!)
    try {
      const payment = await paymentService.processPayment(
        ticket.id,
        userId,
        event.price
      );

      // Step 4: Update ticket status and inventory
      await ticketService.updateTicketStatus(ticket.id, "confirmed");
      await eventService.updateEventTickets(
        eventId,
        event.availableTickets - 1
      );

      console.log(
        `Successfully purchased ticket ${ticket.id} for user ${userId}`
      );

      res.json({
        ticket,
        payment,
        message: "Ticket purchased successfully",
      });
    } catch (paymentError) {
      // Payment failed, cancel the ticket
      await ticketService.updateTicketStatus(ticket.id, "cancelled");
      throw paymentError;
    }
  } catch (error: any) {
    console.error("Purchase failed:", error.message);
    res
      .status(500)
      .json({ error: error.message || "Failed to purchase ticket" });
  }
});

// Get user's tickets
v1Routes.get("/tickets/user/:userId", async (req: Request, res: Response) => {
  try {
    const tickets = await ticketService.getTicketsByUserId(req.params.userId);
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// Health check
v1Routes.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

export { v1Routes };
