// Shared kernel. No frameworks, no connection-bound state.
// Protocol literals (wire keys, event names, codes, topic strings) follow the
// backend contract; every other identifier is English.
export * from "./domains/electoral/results.js";
export * from "./domains/electoral/tally.js";
export * from "./domains/electoral/verification.js";
export * from "./domains/electoral/operation.js";
export * from "./domains/electoral/auth.js";
export * from "./domains/connectivity/backoff.js";
export * from "./domains/connectivity/http.js";
export * from "./domains/connectivity/sse-channel.js";
export * from "./domains/connectivity/ws-channel.js";
export * from "./domains/connectivity/idem.js";
export * from "./domains/connectivity/instance.js";
