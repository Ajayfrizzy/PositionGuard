export type AaveErrorCode = "INVALID_ADDRESS" | "UNSUPPORTED_CHAIN" | "RPC_NOT_CONFIGURED" | "RPC_UNAVAILABLE" | "RPC_RATE_LIMITED" | "RPC_TIMEOUT" | "AAVE_CALL_FAILED" | "NETWORK_MISMATCH" | "CONTRACT_MISMATCH" | "MALFORMED_RPC_RESULT" | "TOKEN_METADATA_FAILED" | "PRICE_NORMALIZATION_FAILED" | "EMPTY_RESERVE_LIST" | "POSITION_INCONSISTENT" | "STATE_CHANGED";
export class AaveReadError extends Error {
  constructor(public readonly code: AaveErrorCode) { super(code); this.name = "AaveReadError"; }
}
