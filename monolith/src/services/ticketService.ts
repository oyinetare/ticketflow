import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { Ticket } from "../types";

export class TicketService {
  async createTicket(
    eventId: string,
    userId: string,
    price: number
  ): Promise<Ticket> {
    const ticket: Ticket = {
      id: uuidv4(),
      eventId,
      userId,
      purchaseDate: new Date(),
      price,
      status: "pending",
    };

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO tickets (id, eventId, userId, purchaseDate, price, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        ticket.id,
        ticket.eventId,
        ticket.userId,
        ticket.purchaseDate.toISOString(),
        ticket.price,
        ticket.status,
        (err: any) => {
          if (err) reject(err);
          else resolve(ticket);
        }
      );

      stmt.finalize();
    });
  }

  async getTicketById(id: string): Promise<Ticket | null> {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM tickets WHERE id = ?", [id], (err, row: any) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else {
          const ticket: Ticket = {
            ...row,
            purchaseDate: new Date(row.purchaseDate),
          };
          resolve(ticket);
        }
      });
    });
  }

  async updateTicketStatus(
    id: string,
    status: Ticket["status"]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE tickets SET status = ? WHERE id = ?",
        [status, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getTicketsByUserId(userId: string): Promise<Ticket[]> {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM tickets WHERE userId = ?",
        [userId],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            const tickets = rows.map((row) => ({
              ...row,
              purchaseDate: new Date(row.purchaseDate),
            }));
            resolve(tickets);
          }
        }
      );
    });
  }
}
