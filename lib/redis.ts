import type { Redis } from "ioredis";
import IORedis from "ioredis";
import { env } from "./env";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  
  if (!client) {
    try {
      client = new IORedis(env.REDIS_URL, { 
        maxRetriesPerRequest: 3, 
        lazyConnect: true 
      });
      client.on("error", (e) => console.error("[redis] error", e?.message));
    } catch (err) {
      console.error("[redis] failed to initialize", err);
      return null;
    }
  }
  
  return client;
}

