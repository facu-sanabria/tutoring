// Simula una sesión válida de Claude cuyo plan agotó la cuota. Nunca usa la red.
export function query() {
  return {
    accountInfo: async () => ({ subscriptionType: "pro", tokenSource: "test" }),
    close() {},
    async *[Symbol.asyncIterator]() {
      yield { type: "assistant", error: "rate_limit", message: { content: [] } };
    }
  };
}
