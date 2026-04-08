import { NextResponse } from "next/server";
import packageJson from "../../../package.json";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    appVersion: packageJson.version,
    buildTime: new Date().toISOString(),
  });
}
