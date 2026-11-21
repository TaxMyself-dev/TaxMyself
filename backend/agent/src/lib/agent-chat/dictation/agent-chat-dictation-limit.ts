// KeepInTax extension: bound paid temporary-key issuance per verified agent user.
// Process-local guard; multiple replicas each enforce their own allowance.
/** Limits temporary-key issuance without retaining inactive users. */
export class AgentDictationLimit {
  private readonly windows = new Map<
    string,
    { started: number; count: number }
  >();

  // Takes one allowance for a verified user in the current minute.
  /**
   * Takes one temporary-key allowance for the verified user.
   * @param userId - Verified agent user id.
   * @param now - Current time in milliseconds.
   * @returns Whether issuance is allowed in the current window.
   */
  take(userId: string, now = Date.now()): boolean {
    for (const [id, window] of this.windows) {
      if (now - window.started >= 60_000) {
        this.windows.delete(id);
      }
    }

    const window = this.windows.get(userId);

    if (window) {
      if (window.count >= 10) {
        return false;
      }

      window.count += 1;

      return true;
    }

    if (this.windows.size >= 10_000) {
      return false;
    }

    this.windows.set(userId, { started: now, count: 1 });

    return true;
  }
}

export const agentDictationLimit = new AgentDictationLimit();
