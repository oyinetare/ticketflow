// Event Service Types
export interface Event {
  id: string;
  name: string;
  venue: string;
  date: Date;
  totalTickets: number;
  availableTickets: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

// Ticket Service Types
export interface Ticket {
  id: string;
  eventId: string;
  userId: string;
  purchaseDate: Date;
  price: number;
  status: "reserved" | "confirmed" | "cancelled";
  paymentId?: string;
}

export interface TicketReservation {
  ticketId: string;
  eventId: string;
  userId: string;
  expiresAt: Date;
}

// Payment Service Types
export interface Payment {
  id: string;
  ticketId: string;
  userId: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  processedAt?: Date;
  createdAt: Date;
  metadata?: any;
}

// Inter-service Messages
export interface ServiceMessage {
  type: string;
  payload: any;
  correlationId: string;
  timestamp: Date;
}

export interface TicketPurchaseRequest {
  eventId: string;
  userId: string;
  idempotencyKey: string;
}

export interface TicketReservedEvent {
  ticketId: string;
  eventId: string;
  userId: string;
  amount: number;
}

export interface PaymentCompletedEvent {
  paymentId: string;
  ticketId: string;
  status: "completed" | "failed";
}
