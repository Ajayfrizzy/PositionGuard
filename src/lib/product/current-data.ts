import "server-only";
import { getServerSession } from "../security/session-context";
import { loadProductData } from "./data";
export async function loadCurrentProductData() { const session = await getServerSession(); return loadProductData(session?.protectedAccountId ?? null, session?.chainId); }
