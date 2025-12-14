export default async function handler(req: Request): Promise<Response> {
  console.log("delete-account: minimal test handler reached");

  return new Response(
    JSON.stringify({ success: true, message: "minimal handler ok" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
