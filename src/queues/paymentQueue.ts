import Bull from "bull";
import { PaymentService } from "../services/paymentService";
import { TicketService } from "../services/ticketService";
import { EventService } from "../services/eventService";

interface PaymentJob {
  ticketId: string;
  eventId: string;
  userId: string;
  amount: number;
  idempotencyKey: string;
}

// Create payment queue
export const paymentQueue = new Bull<PaymentJob>("payment-processing", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Process payment jobs
paymentQueue.process(async (job) => {
  console.log(
    `Processing payment job ${job.id} with idempotency key: ${job.data.idempotencyKey}`
  );

  const { ticketId, userId, amount, eventId } = job.data;
  const paymentService = new PaymentService();
  const ticketService = new TicketService();
  const eventService = new EventService();

  try {
    // Check if payment already processed (idempotency check)
    const existingPayment = await paymentService.getPaymentByTicketId(ticketId);
    if (existingPayment && existingPayment.status === "completed") {
      console.log(`Payment already processed for ticket ${ticketId}`);
      return existingPayment;
    }

    // Process the payment
    const payment = await paymentService.processPayment(
      ticketId,
      userId,
      amount
    );

    // Update ticket status to confirmed
    await ticketService.updateTicketStatus(ticketId, "confirmed");

    console.log(`Payment ${payment.id} completed successfully`);
    return payment;
  } catch (error: any) {
    console.error(
      `Payment processing failed for ticket ${ticketId}:`,
      error.message
    );

    // Update ticket status to cancelled if this is the last attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      await ticketService.updateTicketStatus(ticketId, "cancelled");

      // Return the ticket to inventory
      const event = await eventService.getEventById(eventId);
      if (event) {
        await eventService.updateEventTickets(
          eventId,
          event.availableTickets + 1
        );
      }
    }

    throw error;
  }
});

// Queue event handlers
paymentQueue.on("completed", (job, result) => {
  console.log(`Payment job ${job.id} completed`);
});

paymentQueue.on("failed", (job, err) => {
  console.error(`Payment job ${job?.id} failed:`, err.message);
});

paymentQueue.on("stalled", (job) => {
  console.warn(`Payment job ${job?.id} stalled`);
});
