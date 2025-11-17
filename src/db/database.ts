import sqlite3 from "sqlite3";

const db = new sqlite3.Database(":memory:", (err) => {
  if (err) {
    console.error("Error opening database:", err);
  } else {
    console.log("Connected to SQLite database");
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Events table
    db.run(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        venue TEXT NOT NULL,
        date TEXT NOT NULL,
        totalTickets INTEGER NOT NULL,
        availableTickets INTEGER NOT NULL,
        price REAL NOT NULL,
        createdAt TEXT NOT NULL
      )
    `);

    // Tickets table
    db.run(`
      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        userId TEXT NOT NULL,
        purchaseDate TEXT NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY (eventId) REFERENCES events(id)
      )
    `);

    // Payments table
    db.run(`
      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        ticketId TEXT NOT NULL,
        userId TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        processedAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (ticketId) REFERENCES tickets(id)
      )
    `);

    // Seed some initial data
    const sampleEvents = [
      {
        id: "1",
        name: "Rock Concert 2024",
        venue: "Madison Square Garden",
        date: new Date("2024-12-15").toISOString(),
        totalTickets: 1000,
        availableTickets: 1000,
        price: 99.99,
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        name: "Tech Conference",
        venue: "Convention Center",
        date: new Date("2024-11-20").toISOString(),
        totalTickets: 500,
        availableTickets: 500,
        price: 299.99,
        createdAt: new Date().toISOString(),
      },
      {
        id: "3",
        name: "Comedy Show",
        venue: "Comedy Club Downtown",
        date: new Date("2024-11-25").toISOString(),
        totalTickets: 100,
        availableTickets: 100,
        price: 45.0,
        createdAt: new Date().toISOString(),
      },
    ];

    const stmt = db.prepare(`
      INSERT INTO events (id, name, venue, date, totalTickets, availableTickets, price, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleEvents.forEach((event) => {
      stmt.run(
        event.id,
        event.name,
        event.venue,
        event.date,
        event.totalTickets,
        event.availableTickets,
        event.price,
        event.createdAt
      );
    });

    stmt.finalize();
    console.log("Database initialized with sample data");
  });
}

export { db };
