import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { Event } from "@ticketflow/shared/types";

export class EventService {
  async createEvent(
    eventData: Omit<Event, "id" | "createdAt">
  ): Promise<Event> {
    const event: Event = {
      ...eventData,
      id: uuidv4(),
      createdAt: new Date(),
    };

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO events (id, name, venue, date, totalTickets, availableTickets, price, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.id,
        event.name,
        event.venue,
        event.date.toISOString(),
        event.totalTickets,
        event.availableTickets,
        event.price,
        event.createdAt.toISOString(),
        (err: any) => {
          if (err) reject(err);
          else resolve(event);
        }
      );

      stmt.finalize();
    });
  }

  async getAllEvents(): Promise<Event[]> {
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM events", (err, rows: any[]) => {
        if (err) reject(err);
        else {
          const events = rows.map((row) => ({
            ...row,
            date: new Date(row.date),
            createdAt: new Date(row.createdAt),
          }));
          resolve(events);
        }
      });
    });
  }

  async getEventById(id: string): Promise<Event | null> {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM events WHERE id = ?", [id], (err, row: any) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else {
          const event: Event = {
            ...row,
            date: new Date(row.date),
            createdAt: new Date(row.createdAt),
          };
          resolve(event);
        }
      });
    });
  }

  async updateEventTickets(
    id: string,
    availableTickets: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE events SET availableTickets = ? WHERE id = ?",
        [availableTickets, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}
