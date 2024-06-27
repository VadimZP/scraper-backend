import express, { Express, NextFunction, Request, Response } from "express";
import dotenv from "dotenv";

import scrapData from "@/scrapData";

dotenv.config();

const app: Express = express();

app.use(express.json());

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    statusCode: statusCode,
    message: error.message,
  });
});

app.get("/", (req, res) => {
  res.json({ message: "hello", statusCode: 200 });
});

app.listen(8000, () => {
  console.log(`App is listening on port ${process.env.SERVER_PORT}`);

  scrapData();
});
