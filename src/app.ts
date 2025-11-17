import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { router } from "./api/routes";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api", router);

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`TicketFlow server running on http://localhost:${PORT}`);
  console.log("Available endpoints:");
  console.log("  GET  /api/events");
  console.log("  GET  /api/events/:id");
  console.log("  POST /api/events");
  console.log("  POST /api/tickets/purchase");
  console.log("  GET  /api/tickets/user/:userId");
});

export default app;
