export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
