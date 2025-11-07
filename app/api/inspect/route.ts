import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { z } from "zod";
import { env } from "@/lib/env";
import { isAllowedUrl, normalizeHost } from "@/lib/host";

const Q = z.object({ url: z.string().url() });

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const q = Q.safeParse({ url: u.searchParams.get("url") });

  if (!q.success) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 422 });
  }

  const allow = env.ALLOW_DOMAINS.map(normalizeHost);
  if (!isAllowedUrl(q.data.url, allow)) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
  }

  const child = spawn("yt-dlp", ["--dump-single-json", "--no-warnings", q.data.url], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  let stderr = "";
  
  child.stdout.on("data", (b) => (out += b.toString()));
  child.stderr.on("data", (b) => (stderr += b.toString()));

  // Timeout handling
  const timeout = setTimeout(() => {
    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2000);
    } catch (err) {
      // Ignore
    }
  }, 15000); // 15 second timeout

  const code: number = await new Promise((res) => {
    child.on("close", (c) => {
      clearTimeout(timeout);
      res(c ?? 0);
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      console.error("[inspect] spawn error:", err);
      res(1);
    });
  });

  if (code !== 0) {
    return NextResponse.json({ error: "Probe failed", details: stderr.substring(0, 200) }, { status: 502 });
  }

  try {
    const data = JSON.parse(out);
    
    // Extract relevant information
    const formats = data.formats || [];
    const videoFormats = formats
      .filter((f: any) => f.vcodec && f.vcodec !== "none")
      .map((f: any) => ({
        format_id: f.format_id,
        height: f.height,
        width: f.width,
        fps: f.fps,
        vcodec: f.vcodec,
        acodec: f.acodec,
        hasAudio: !!(f.acodec && f.acodec !== "none"),
        filesize: f.filesize,
        quality: f.height ? `${f.height}p` : f.quality || "unknown",
        format_note: f.format_note,
      }))
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    return NextResponse.json({
      title: data.title || "Unknown",
      description: data.description || "",
      duration: data.duration,
      thumbnail: data.thumbnail || data.thumbnails?.[0]?.url,
      formats: videoFormats,
      uploader: data.uploader || data.channel || "",
      upload_date: data.upload_date,
    });
  } catch (e) {
    return NextResponse.json({ error: "Invalid probe JSON", details: String(e) }, { status: 502 });
  }
}

