//! Fire-and-forget interaction push notify.
//!
//! POSTs to the control plane's runtime interaction push webhook
//! (`POST {PROLIFERATE_PUSH_SERVER_URL}/v1/internal/push/interaction`, see
//! `server/proliferate/server/cloud/push/api.py`) the instant the runtime
//! emits an interaction the user must act on (`interaction_requested`) or a
//! turn ends leaving the session `AwaitingInteraction`, so a push lands on the
//! user's phone with no polling.
//!
//! No-op when `PROLIFERATE_PUSH_SERVER_URL` or `PROLIFERATE_PUSH_SANDBOX_TOKEN`
//! is unset — every context outside a provisioned cloud sandbox (desktop,
//! local dev, tests) simply never fires. Deduped per-process by `(kind,
//! request_id)`: a cheap short-circuit against firing the exact same HTTP call
//! twice from this process; the interaction_requested push and a later
//! "awaiting" catch-up for the same request_id are independent keys and both
//! get a chance to reach the server (the server independently,
//! authoritatively dedupes on `(session_id, request_id)` — see
//! `claim_webhook_event` in `db/store/billing_runtime_usage.py` — so a device
//! never sees a duplicate regardless of how many times this process attempts
//! it). Never blocks the caller: the POST runs on a detached `tokio::spawn`
//! task and every failure is swallowed (logged at `debug`) — a push delivery
//! hiccup must never stall or fail the session loop.

use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use anyharness_contract::v1::InteractionKind;

const SERVER_URL_ENV: &str = "PROLIFERATE_PUSH_SERVER_URL";
const SANDBOX_TOKEN_ENV: &str = "PROLIFERATE_PUSH_SANDBOX_TOKEN";
const WEBHOOK_PATH: &str = "/v1/internal/push/interaction";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PushInteractionWebhookBody {
    sandbox_token: String,
    workspace_id: String,
    session_id: String,
    request_id: String,
    kind: String,
    title: String,
}

/// Notify for a freshly requested interaction (`Permission` / `UserInput` /
/// `McpElicitation`). Call right after `SessionEventSink::interaction_requested`
/// — same request_id, same title.
pub(crate) fn notify_interaction(
    workspace_id: &str,
    session_id: &str,
    request_id: &str,
    kind: &InteractionKind,
    title: &str,
) {
    notify(
        workspace_id,
        session_id,
        request_id,
        interaction_kind_push_str(kind),
        title,
    );
}

/// Notify for a turn that ended while the session is still
/// `SessionExecutionPhase::AwaitingInteraction` on this `request_id` (the
/// harness's own turn completed without resolving it — a fire-and-forget MCP
/// elicitation is the common case). A `kind: "awaiting"` push, distinct from
/// the specific interaction kinds `notify_interaction` sends.
pub(crate) fn notify_awaiting(workspace_id: &str, session_id: &str, request_id: &str, title: &str) {
    notify(workspace_id, session_id, request_id, "awaiting", title);
}

fn notify(workspace_id: &str, session_id: &str, request_id: &str, kind: &str, title: &str) {
    let Some(server_url) = env_value(SERVER_URL_ENV) else {
        return;
    };
    let Some(sandbox_token) = env_value(SANDBOX_TOKEN_ENV) else {
        return;
    };
    // Dedupe key is (kind, request_id), not request_id alone: the "awaiting"
    // catch-up (a TurnEnded that still finds this request_id pending) must NOT
    // be silently suppressed just because the original interaction_requested
    // push already claimed the id — if that original attempt's HTTP call
    // itself failed (network blip, swallowed below), the catch-up is the only
    // remaining chance to reach the server. The server's own dedupe on
    // `(session_id, request_id)` (kind-agnostic) is what actually guarantees
    // the device never sees a duplicate, so it is safe for this process to
    // attempt both independently.
    if !claim_request_id(&format!("{kind}:{request_id}")) {
        return;
    }

    let body = PushInteractionWebhookBody {
        sandbox_token,
        workspace_id: workspace_id.to_string(),
        session_id: session_id.to_string(),
        request_id: request_id.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
    };
    let url = format!("{}{}", server_url.trim_end_matches('/'), WEBHOOK_PATH);

    // Detached: the caller (the session actor loop) must never wait on, or be
    // failed by, a push delivery. Building the client and sending both happen
    // inside the spawned task, so `notify` itself never touches the network.
    tokio::spawn(async move {
        let client = match reqwest::Client::builder().timeout(REQUEST_TIMEOUT).build() {
            Ok(client) => client,
            Err(error) => {
                tracing::debug!(error = %error, "push_notify: failed to build HTTP client");
                return;
            }
        };
        if let Err(error) = client.post(&url).json(&body).send().await {
            tracing::debug!(
                error = %error,
                request_id = %body.request_id,
                "push_notify: interaction push webhook request failed"
            );
        }
    });
}

fn interaction_kind_push_str(kind: &InteractionKind) -> &'static str {
    match kind {
        InteractionKind::Permission => "permission",
        InteractionKind::UserInput => "user_input",
        InteractionKind::McpElicitation => "mcp_elicitation",
    }
}

fn env_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn dedupe_set() -> &'static Mutex<HashSet<String>> {
    static SEEN: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SEEN.get_or_init(|| Mutex::new(HashSet::new()))
}

/// True the first time this `request_id` is claimed by this process, false on
/// every repeat.
fn claim_request_id(request_id: &str) -> bool {
    let mut seen = dedupe_set()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    seen.insert(request_id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;
    use std::time::Instant;

    // std::env::set_var/remove_var mutate whole-process state; serialize the
    // env-touching tests so they cannot interleave.
    static ENV_LOCK: StdMutex<()> = StdMutex::new(());

    fn clear_env() {
        std::env::remove_var(SERVER_URL_ENV);
        std::env::remove_var(SANDBOX_TOKEN_ENV);
    }

    #[test]
    fn no_op_when_server_url_env_is_absent() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        clear_env();
        std::env::set_var(SANDBOX_TOKEN_ENV, "tok");

        notify_interaction(
            "workspace-1",
            "session-1",
            "request-no-op-server-url",
            &InteractionKind::Permission,
            "Approve?",
        );

        // Returned before ever claiming the request id: a later call (once
        // env is configured) for the same interaction still fires.
        assert!(claim_request_id("request-no-op-server-url"));
        clear_env();
    }

    #[test]
    fn no_op_when_sandbox_token_env_is_absent() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        clear_env();
        std::env::set_var(SERVER_URL_ENV, "http://127.0.0.1:1");

        notify_interaction(
            "workspace-1",
            "session-1",
            "request-no-op-token",
            &InteractionKind::Permission,
            "Approve?",
        );

        assert!(claim_request_id("request-no-op-token"));
        clear_env();
    }

    #[test]
    fn no_op_when_both_env_vars_are_absent() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        clear_env();

        notify_awaiting("workspace-1", "session-1", "request-no-op-both", "Awaiting");

        assert!(claim_request_id("request-no-op-both"));
    }

    #[test]
    fn dedupes_repeat_request_id_within_the_process() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());

        assert!(claim_request_id("request-dedupe-unique"));
        assert!(!claim_request_id("request-dedupe-unique"));
        assert!(!claim_request_id("request-dedupe-unique"));
        assert!(claim_request_id("request-dedupe-unique-2"));
    }

    #[test]
    fn interaction_and_awaiting_dedupe_keys_are_independent_per_request_id() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        // Mirrors the composite keys `notify` builds internally
        // (`format!("{kind}:{request_id}")`): an interaction_requested push
        // and a later "awaiting" catch-up for the SAME request_id must not
        // suppress each other — see the comment on the dedupe call in
        // `notify`. Repeating the exact same (kind, request_id) is still
        // deduped.
        assert!(claim_request_id("permission:request-independent"));
        assert!(claim_request_id("awaiting:request-independent"));
        assert!(!claim_request_id("permission:request-independent"));
        assert!(!claim_request_id("awaiting:request-independent"));
    }

    #[tokio::test]
    async fn notify_is_non_blocking_and_returns_immediately() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        clear_env();
        // TEST-NET-1 (RFC 5737): guaranteed non-routable, so the connect
        // attempt inside the spawned task never completes quickly. If
        // `notify_interaction` awaited the request itself rather than
        // spawning it detached, this call would block for (up to)
        // REQUEST_TIMEOUT and this assertion would fail.
        std::env::set_var(SERVER_URL_ENV, "http://192.0.2.1");
        std::env::set_var(SANDBOX_TOKEN_ENV, "tok");

        let started = Instant::now();
        notify_interaction(
            "workspace-1",
            "session-1",
            "request-nonblocking",
            &InteractionKind::Permission,
            "Approve?",
        );
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "notify_interaction must return immediately, took {:?}",
            started.elapsed()
        );
        clear_env();
    }

    #[test]
    fn maps_interaction_kind_to_push_kind_strings() {
        assert_eq!(
            interaction_kind_push_str(&InteractionKind::Permission),
            "permission"
        );
        assert_eq!(
            interaction_kind_push_str(&InteractionKind::UserInput),
            "user_input"
        );
        assert_eq!(
            interaction_kind_push_str(&InteractionKind::McpElicitation),
            "mcp_elicitation"
        );
    }

    #[test]
    fn webhook_body_serializes_camel_case_matching_the_server_contract() {
        let body = PushInteractionWebhookBody {
            sandbox_token: "tok".to_string(),
            workspace_id: "w1".to_string(),
            session_id: "s1".to_string(),
            request_id: "r1".to_string(),
            kind: "permission".to_string(),
            title: "Approve?".to_string(),
        };
        let json = serde_json::to_value(&body).expect("serializes");
        assert_eq!(
            json,
            serde_json::json!({
                "sandboxToken": "tok",
                "workspaceId": "w1",
                "sessionId": "s1",
                "requestId": "r1",
                "kind": "permission",
                "title": "Approve?",
            })
        );
    }
}
