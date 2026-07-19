/**
 * Group F spike — pure dedupe state for the terminal WebSocket stream's
 * `seq`, mirroring E1's `applyStreamEnvelope` discipline
 * (`hooks/chat/derived/session-transcript-stream-state.ts`). See this
 * module's `.test.ts` for why this exists on top of the SDK's own internal
 * per-connection dedupe (`anyharness/sdk/src/streams/terminals.ts`).
 */

export interface TerminalFrameDedupeState {
  readonly lastSeq: number;
}

export function createTerminalFrameDedupeState(initialSeq = 0): TerminalFrameDedupeState {
  return { lastSeq: initialSeq };
}

export interface TerminalFrameDedupeResult {
  state: TerminalFrameDedupeState;
  accepted: boolean;
}

/**
 * `TerminalDataFrame` and `TerminalExitFrame` (`@anyharness/sdk`) both carry
 * a `seq` from one shared counter, so both frame types flow through this
 * same function — the caller doesn't need to discriminate frame type to
 * dedupe correctly.
 */
export function acceptTerminalFrame(
  state: TerminalFrameDedupeState,
  seq: number,
): TerminalFrameDedupeResult {
  if (seq <= state.lastSeq) {
    return { state, accepted: false };
  }
  return { state: { lastSeq: seq }, accepted: true };
}
