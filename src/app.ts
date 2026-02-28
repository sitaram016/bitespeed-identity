import express, { Request, Response, NextFunction } from "express";
import { identifyContact } from "./identifyService";

const app = express();

app.use(express.json());

// Health check
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Bitespeed Identity Service is running" });
});

// Main identify endpoint
app.post("/identify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, phoneNumber } = req.body;

    // Validate: at least one must be present
    if (!email && !phoneNumber) {
      res.status(400).json({
        error: "Bad Request",
        message: "At least one of 'email' or 'phoneNumber' must be provided",
      });
      return;
    }

    // Validate types
    if (email && typeof email !== "string") {
      res.status(400).json({ error: "Bad Request", message: "'email' must be a string" });
      return;
    }
    if (phoneNumber && typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Bad Request", message: "'phoneNumber' must be a string" });
      return;
    }

    const result = await identifyContact({
      email: email ?? null,
      phoneNumber: phoneNumber ?? null,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

export default app;
