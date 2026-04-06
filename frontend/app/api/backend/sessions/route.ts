import { NextRequest, NextResponse } from "next/server";

const BACKEND =
  process.env.BACKEND_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8005";

export async function POST(request: NextRequest) {
  const target = `${BACKEND}/sessions`;
  try {
    const body = await request.arrayBuffer();
    const ct = request.headers.get("content-type");
    const res = await fetch(target, {
      method: "POST",
      headers: ct ? { "content-type": ct } : {},
      body: body.byteLength > 0 ? body : undefined,
    });
    const outCt = res.headers.get("content-type");
    return new NextResponse(res.body, {
      status: res.status,
      headers: outCt ? { "content-type": outCt } : {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "proxy_error";
    return NextResponse.json(
      {
        error: "backend_unreachable",
        detail: msg,
        backend: BACKEND,
        hint: "Start FastAPI (e.g. uvicorn on 8080) or set BACKEND_URL in frontend/.env.local",
      },
      { status: 502 },
    );
  }
}
