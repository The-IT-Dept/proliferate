import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@proliferate/design/glass";

import {
  mobileToastQueueReducer,
  type MobileToastItem,
  type MobileToastTone,
} from "../lib/domain/feedback/mobile-toast-queue";
import { MobileIcon, type MobileIconName } from "../components/primitives/MobileIcon";
import { colors, radius, spacing } from "../styles/tokens";

const DEFAULT_TOAST_DURATION_MS = 3000;

export interface MobileToastInput {
  message: string;
  /** @default "info" */
  tone?: MobileToastTone;
  /** @default 3000 */
  durationMs?: number;
}

interface MobileToastContextValue {
  show: (input: MobileToastInput) => string;
  dismiss: (id: string) => void;
}

const MobileToastContext = createContext<MobileToastContextValue | null>(null);

/**
 * Small, generic feedback primitive (Group C / I1) reused by any surface
 * that fires a mutation and needs to report success/failure without a
 * blocking Alert. `show()` returns the toast id so a caller can `dismiss()`
 * it early (not currently needed by Group C, but kept for later groups).
 * Must be called under `MobileToastProvider` (mounted once in
 * `app/_layout.tsx`).
 */
export function useMobileToast(): MobileToastContextValue {
  const value = useContext(MobileToastContext);
  if (!value) {
    throw new Error("useMobileToast must be used within MobileToastProvider.");
  }
  return value;
}

let toastIdSequence = 0;
function nextToastId(): string {
  toastIdSequence += 1;
  return `mobile-toast-${toastIdSequence}`;
}

export function MobileToastProvider({ children }: { children: ReactNode }) {
  const [queue, dispatch] = useReducer(mobileToastQueueReducer, [] as MobileToastItem[]);
  // Per-toast auto-dismiss duration, keyed by id. Not part of the reducer's
  // state (which stays pure/display-only) since it's read once by the
  // timer effect below, not something display logic branches on.
  const durationById = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    durationById.current.delete(id);
    dispatch({ type: "dismiss", id });
  }, []);

  const show = useCallback((input: MobileToastInput) => {
    const id = nextToastId();
    durationById.current.set(id, input.durationMs ?? DEFAULT_TOAST_DURATION_MS);
    dispatch({
      type: "enqueue",
      toast: { id, message: input.message, tone: input.tone ?? "info" },
    });
    return id;
  }, []);

  const active = queue[0] ?? null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const durationMs = durationById.current.get(active.id) ?? DEFAULT_TOAST_DURATION_MS;
    const timer = setTimeout(() => dismiss(active.id), durationMs);
    return () => clearTimeout(timer);
  }, [active, dismiss]);

  const contextValue = useMemo<MobileToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <MobileToastContext.Provider value={contextValue}>
      {children}
      <MobileToastHost toast={active} onDismiss={dismiss} />
    </MobileToastContext.Provider>
  );
}

const TONE_ICON: Record<MobileToastTone, MobileIconName> = {
  success: "check",
  error: "close",
  info: "sparkles",
};

const TONE_COLOR: Record<MobileToastTone, string> = {
  success: colors.success,
  error: colors.destructive,
  info: colors.info,
};

/**
 * Rendered in its own transparent `Modal` (not a plain absolutely-positioned
 * View) so it reliably layers above other native content — including a
 * currently-open `MobileWorkspaceActionSheet`, which is itself a `Modal`:
 * plain View siblings can't paint over another Modal's native surface on
 * iOS, but a second Modal presented afterwards stacks on top of it. Only
 * mounted while a toast is active, so there's no always-on empty overlay.
 */
function MobileToastHost({
  toast,
  onDismiss,
}: {
  toast: MobileToastItem | null;
  onDismiss: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!toast) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => onDismiss(toast.id)}>
      <View pointerEvents="box-none" style={[styles.host, { paddingTop: insets.top + spacing[3] }]}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={toast.message}
          onPress={() => onDismiss(toast.id)}
          style={styles.pressable}
        >
          <GlassSurface variant="fab" style={styles.surface}>
            <View style={[styles.iconTile, { backgroundColor: `${TONE_COLOR[toast.tone]}26` }]}>
              <MobileIcon name={TONE_ICON[toast.tone]} size={14} color={TONE_COLOR[toast.tone]} />
            </View>
            <Text style={styles.message} numberOfLines={3}>
              {toast.message}
            </Text>
          </GlassSurface>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: "center",
  },
  pressable: {
    width: "100%",
    paddingHorizontal: spacing[4],
  },
  surface: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderRadius: radius.xl,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
  },
});
