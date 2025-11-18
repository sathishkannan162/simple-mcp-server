import { config } from "dotenv";
import express from "express";

const app = express();
const port = 4000;

config();

app.get("/ping", (_req, res) => {
  res.send("pong");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
