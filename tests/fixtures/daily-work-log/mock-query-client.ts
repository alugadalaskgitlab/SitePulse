export async function apiRequest() {
  return new Response(JSON.stringify({ id: 1 }), { status: 201 });
}
