import { useEffect, useMemo, useState } from "react";
import { kitchenApi } from "../api/irmsApi";

const columns = [
  { key: "new", title: "New Tickets" },
  { key: "cooking", title: "Cooking" },
  { key: "ready", title: "Ready for Serve" },
];

const requestTypeLabel = {
  cancel_item: "Cancel item",
  change_quantity: "Change quantity",
  change_note: "Change note",
};

const formatDueTime = (value) => {
  if (!value) {
    return "N/A";
  }
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) {
    return "N/A";
  }
  return dueDate.toLocaleTimeString();
};

export const KitchenPage = () => {
  const [items, setItems] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [reviewNotes, setReviewNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    return columns.reduce((acc, col) => {
      acc[col.key] = items.filter((item) => item.kitchen_status_key === col.key);
      return acc;
    }, {});
  }, [items]);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [kitchenData, pendingRequests] = await Promise.all([
        kitchenApi.listItems("new,cooking,ready"),
        kitchenApi.listChangeRequests("pending"),
      ]);
      setItems(kitchenData || []);
      setChangeRequests(pendingRequests || []);
      setError("");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load kitchen queue");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    refresh(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      refresh(false).catch(() => {
        // Polling can fail silently and retry on next cycle.
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const moveStatus = async (itemId, status) => {
    try {
      setBusy(`${itemId}-${status}`);
      await kitchenApi.updateItemStatus(itemId, status);
      await refresh(false);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to update item status");
    } finally {
      setBusy("");
    }
  };

  const reviewRequest = async (requestId, decision) => {
    try {
      setBusy(`review-${requestId}-${decision}`);
      await kitchenApi.reviewChangeRequest(requestId, {
        decision,
        kitchen_note: reviewNotes[requestId] || "",
      });
      await refresh(false);
      setReviewNotes((prev) => ({ ...prev, [requestId]: "" }));
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to review request");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <main className="boot-screen">
        <div className="loader" />
        <p>Preparing kitchen display...</p>
      </main>
    );
  }

  return (
    <main className="kitchen-board">
      <header className="panel-header">
        <h2>Kitchen Display System</h2>
        <button type="button" className="ghost-btn" onClick={() => refresh(true)}>
          Refresh queue
        </button>
      </header>

      <div className="kitchen-columns">
        {columns.map((column) => (
          <section key={column.key} className="kitchen-column">
            <div className="column-head">
              <h3>{column.title}</h3>
              <span className="badge">{grouped[column.key]?.length || 0}</span>
            </div>

            {grouped[column.key]?.length ? null : <p className="muted">No item</p>}

            {grouped[column.key]?.map((item) => (
              <article key={item.order_item_id} className="kitchen-ticket">
                <h4>
                  {item.quantity}x {item.item_name_snapshot}
                </h4>
                <p>
                  Table {item.table_code} | {item.order_no} | station {item.station_key || "N/A"}
                </p>
                <p>
                  Queue: {item.queue_age_minutes ?? 0} min | SLA: {item.expected_cook_minutes ?? 0} min
                </p>
                <div className="kitchen-urgency-row">
                  <span className={`status-pill urgency-${item.urgency_key || "normal"}`}>
                    {item.urgency_key || "normal"}
                  </span>
                  <small>Due: {formatDueTime(item.due_at)}</small>
                </div>
                <small>{item.note || "No note"}</small>

                {item.kitchen_status_key === "new" ? (
                  <button
                    type="button"
                    className="solid-btn"
                    disabled={busy === `${item.order_item_id}-cooking`}
                    onClick={() => moveStatus(item.order_item_id, "cooking")}
                  >
                    {busy === `${item.order_item_id}-cooking` ? "Updating..." : "Start cooking"}
                  </button>
                ) : null}

                {item.kitchen_status_key === "cooking" ? (
                  <button
                    type="button"
                    className="solid-btn"
                    disabled={busy === `${item.order_item_id}-ready`}
                    onClick={() => moveStatus(item.order_item_id, "ready")}
                  >
                    {busy === `${item.order_item_id}-ready` ? "Updating..." : "Mark ready"}
                  </button>
                ) : null}

                {item.kitchen_status_key === "ready" ? (
                  <span className="status-pill ready">Waiting waiter pickup</span>
                ) : null}
              </article>
            ))}
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Pending Change Requests</h3>
          <span className="badge">{changeRequests.length}</span>
        </div>

        {changeRequests.length === 0 ? <p className="muted">No pending request.</p> : null}

        {changeRequests.map((request) => (
          <article key={request.change_request_id} className="request-review-card">
            <div>
              <strong>
                {request.item_name_snapshot} | Table {request.table_code}
              </strong>
              <p>
                {requestTypeLabel[request.request_type_key]} by {request.requested_by_name}
              </p>
              <small>Current: qty {request.current_quantity} | note: {request.current_note || "none"}</small>
              {request.request_type_key === "change_quantity" ? (
                <small>Requested qty: {request.requested_quantity}</small>
              ) : null}
              {request.request_type_key === "change_note" ? (
                <small>Requested note: {request.requested_note || "none"}</small>
              ) : null}
              {request.reason ? <small>Reason: {request.reason}</small> : null}
            </div>

            <div className="request-review-actions">
              <input
                placeholder="Kitchen note (optional)"
                value={reviewNotes[request.change_request_id] || ""}
                onChange={(event) =>
                  setReviewNotes((prev) => ({
                    ...prev,
                    [request.change_request_id]: event.target.value,
                  }))
                }
              />

              <div className="request-review-buttons">
                <button
                  type="button"
                  className="solid-btn"
                  disabled={busy === `review-${request.change_request_id}-approved`}
                  onClick={() => reviewRequest(request.change_request_id, "approved")}
                >
                  {busy === `review-${request.change_request_id}-approved`
                    ? "Applying..."
                    : "Approve"}
                </button>
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy === `review-${request.change_request_id}-rejected`}
                  onClick={() => reviewRequest(request.change_request_id, "rejected")}
                >
                  {busy === `review-${request.change_request_id}-rejected`
                    ? "Updating..."
                    : "Reject"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
    </main>
  );
};
