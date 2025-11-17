import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { Payment } from "../types";

export class PaymentService {
  async processPayment(
    ticketId: string,
    userId: string,
    amount: number
  ): Promise<Payment> {
    console.log(
      `Processing payment for ticket ${ticketId}, amount: $${amount}`
    );

    // Simulate payment processing delay (this will cause problems in Phase 2!)
    await this.simulatePaymentGateway();

    const payment: Payment = {
      id: uuidv4(),
      ticketId,
      userId,
      amount,
      status: "completed",
      processedAt: new Date(),
      createdAt: new Date(),
    };

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO payments (id, ticketId, userId, amount, status, processedAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        payment.id,
        payment.ticketId,
        payment.userId,
        payment.amount,
        payment.status,
        payment.processedAt?.toISOString(),
        payment.createdAt.toISOString(),
        (err: any) => {
          if (err) reject(err);
          else resolve(payment);
        }
      );

      stmt.finalize();
    });
  }

  private async simulatePaymentGateway(): Promise<void> {
    // Simulate API call to payment gateway
    // This delay will cause race conditions!
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Simulate occasional payment failures (10% chance)
    if (Math.random() < 0.1) {
      throw new Error("Payment gateway error");
    }
  }

  async getPaymentByTicketId(ticketId: string): Promise<Payment | null> {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM payments WHERE ticketId = ?",
        [ticketId],
        (err, row: any) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else {
            const payment: Payment = {
              ...row,
              processedAt: row.processedAt
                ? new Date(row.processedAt)
                : undefined,
              createdAt: new Date(row.createdAt),
            };
            resolve(payment);
          }
        }
      );
    });
  }
}
