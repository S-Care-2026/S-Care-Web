// Imported first by index.js, so every other module sees backend/.env at import time.
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const isProduction = process.env.NODE_ENV === "production";
