import { handlePositionRequest, livePositionReader } from "@/lib/aave/http";
import { persistPositionSnapshot } from "@/lib/aave/snapshots";
export const runtime = "nodejs";
export const maxDuration = 60;
const handler = (request: Request) =>
  handlePositionRequest(request, {
    getPosition: livePositionReader,
    persist: persistPositionSnapshot,
  });
export const GET = handler;
export const POST = handler;
