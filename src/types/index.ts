export interface Event {
  id: string;
  name: string;
  venue: string;
  date: Date;
  totalTickets: number;
  availableTickets: number;
  price: number;
  createdAt: Date;
}

export interface Ticket {
  id: string;
  eventId: string;
  userId: string;
  purchaseDate: Date;
  price: number;
  status: "pending" | "confirmed" | "cancelled";
}

export interface Payment {
  id: string;
  ticketId: string;
  userId: string;
  amount: number;
  status: "pending" | "completed" | "failed";
  processedAt?: Date;
  createdAt: Date;
}
