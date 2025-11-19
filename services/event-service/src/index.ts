import express from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
// import { Event } from "../../shared/types";

const app = express();
app.use(express.json());

// PostgreSQL connection
const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  database: "events",
  user: "postgres",
  password: "postgres",
  port: 5432,
});

// Redis for pub/sub
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: 6379,
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();

// Initialize database
async function initDB() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        venue VARCHAR(255) NOT NULL,
        date TIMESTAMP NOT NULL,
        total_tickets INTEGER NOT NULL,
        available_tickets INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Seed data
    const events = await db.query("SELECT COUNT(*) FROM events");
    if (events.rows[0].count === "0") {
      await db.query(
        `
        INSERT INTO events (id, name, venue, date, total_tickets, available_tickets, price)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7),
          ($8, $9, $10, $11, $12, $13, $14)
      `,
        [
          uuidv4(),
          "Rock Concert 2024",
          "Madison Square Garden",
          new Date("2024-12-15"),
          1000,
          1000,
          99.99,
          uuidv4(),
          "Tech Conference",
          "Convention Center",
          new Date("2024-11-20"),
          500,
          500,
          299.99,
        ]
      );
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// API Routes
app.get("/events", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM events ORDER BY date");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.get("/events/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM events WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

app.post("/events", async (req, res) => {
  const { name, venue, date, totalTickets, price } = req.body;
  const id = uuidv4();

  try {
    await db.query(
      `INSERT INTO events (id, name, venue, date, total_tickets, available_tickets, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, venue, date, totalTickets, totalTickets, price]
    );

    const result = await db.query("SELECT * FROM events WHERE id = $1", [id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Internal API for ticket service
app.post("/events/:id/reserve", async (req, res) => {
  const { id } = req.params;
  const { quantity = 1 } = req.body;

  try {
    // Use optimistic locking with UPDATE ... RETURNING
    const result = await db.query(
      `
      UPDATE events 
      SET available_tickets = available_tickets - $1,
          updated_at = NOW()
      WHERE id = $2 AND available_tickets >= $1
      RETURNING *
    `,
      [quantity, id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "Not enough tickets available" });
    }

    // Publish event updated message
    await pubClient.publish(
      "events:updated",
      JSON.stringify({
        eventId: id,
        availableTickets: result.rows[0].available_tickets,
      })
    );

    res.json({
      success: true,
      event: result.rows[0],
      reserved: quantity,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to reserve tickets" });
  }
});

app.post("/events/:id/release", async (req, res) => {
  const { id } = req.params;
  const { quantity = 1 } = req.body;

  try {
    const result = await db.query(
      `
      UPDATE events 
      SET available_tickets = available_tickets + $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [quantity, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Publish event updated message
    await pubClient.publish(
      "events:updated",
      JSON.stringify({
        eventId: id,
        availableTickets: result.rows[0].available_tickets,
      })
    );

    res.json({
      success: true,
      event: result.rows[0],
      released: quantity,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to release tickets" });
  }
});

// Health check
app.get("/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      service: "event-service",
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      service: "event-service",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});

const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Event Service running on port ${PORT}`);
  });
});
