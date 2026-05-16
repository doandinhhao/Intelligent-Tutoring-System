import { useEffect, useMemo, useState } from "react";
import { kitchenApi, menuApi, ordersApi, tablesApi } from "../api/irmsApi";
import { http, unwrap } from "../api/http";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount || 0);

const fallbackDraft = { qty: 1, note: "" };
const fallbackChangeDraft = {
  request_type: "cancel_item",
  requested_quantity: 1,
  requested_note: "",
  reason: "",
};

const requestTypeLabel = {
  cancel_item: "Cancel item",
  change_quantity: "Change quantity",
  change_note: "Change note",
};

const requestStatusLabel = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export const WaiterPage = ({
  mode = "full",
  forcedTableId = null,
  onSelectTable = null,
  onBackToBoard = null,
}) => {
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [handoffItems, setHandoffItems] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [sessionOrders, setSessionOrders] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [itemDrafts, setItemDrafts] = useState({});
  const [changeDrafts, setChangeDrafts] = useState({});
  const [guestForm, setGuestForm] = useState({
    customer_name: "",
    customer_phone: "",
    party_size: 2,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const isTablesOnly = mode === "tables";
  const isDetailOnly = mode === "detail";

  const selectedTable = useMemo(
    () => tables.find((table) => table.table_id === selectedTableId) || null,
    [tables, selectedTableId],
  );

  const selectedSessionId = selectedTable?.active_session?.session_id || null;
  const selectedSessionStatus = selectedTable?.active_session?.session_status_key || null;
  const selectedBillSummary = selectedTable?.active_session?.bill_summary || null;
  const isAwaitingPayment = selectedSessionStatus === "awaiting_payment";
  const isServiceCompleted = selectedSessionStatus === "service_completed";

  const activeDraftOrder = useMemo(
    () => sessionOrders.find((order) => order.order_status_key === "draft") || null,
    [sessionOrders],
  );
  const orderIsDraft = Boolean(activeDraftOrder);

  const readyItemsForSelectedTable = useMemo(() => {
    if (!selectedSessionId) {
      return [];
    }
    return handoffItems.filter(
      (item) => item.session_id === selectedSessionId && item.kitchen_status_key === "ready",
    );
  }, [handoffItems, selectedSessionId]);

  const servedItemsForSelectedTable = useMemo(() => {
    if (!selectedSessionId) {
      return [];
    }
    return handoffItems.filter(
      (item) => item.session_id === selectedSessionId && item.kitchen_status_key === "served",
    );
  }, [handoffItems, selectedSessionId]);

  const pendingRequestByItemId = useMemo(() => {
    const map = new Map();
    for (const request of changeRequests) {
      if (request.status_key === "pending") {
        map.set(request.order_item_id, request);
      }
    }
    return map;
  }, [changeRequests]);

  const latestRequests = useMemo(() => changeRequests.slice(0, 8), [changeRequests]);

  const orderItems = useMemo(() => {
    return sessionOrders.flatMap((order) =>
      (order.items || []).map((item) => ({
        ...item,
        order_no: order.order_no,
        order_status_key: order.order_status_key,
      })),
    );
  }, [sessionOrders]);

  const activeOrderItems = useMemo(() => {
    return orderItems.filter(
      (item) => !["served", "cancelled"].includes(item.kitchen_status_key),
    );
  }, [orderItems]);

  const activeSubtotal = useMemo(() => {
    return activeOrderItems.reduce((sum, item) => sum + item.line_subtotal, 0);
  }, [activeOrderItems]);

  const sessionSubtotal = useMemo(() => {
    return orderItems
      .filter((item) => item.kitchen_status_key !== "cancelled")
      .reduce((sum, item) => sum + item.line_subtotal, 0);
  }, [orderItems]);

  const refreshTablesAndHandoff = async () => {
    const [tableData, handoffData] = await Promise.all([
      tablesApi.list(),
      kitchenApi.listItems("ready,served"),
    ]);
    setTables(tableData);

    if (
      Number.isInteger(forcedTableId) &&
      forcedTableId > 0 &&
      tableData.some((table) => table.table_id === forcedTableId)
    ) {
      setSelectedTableId(forcedTableId);
    } else if (!selectedTableId && tableData.length > 0) {
      setSelectedTableId(tableData[0].table_id);
    } else if (selectedTableId && !tableData.some((table) => table.table_id === selectedTableId)) {
      setSelectedTableId(tableData[0]?.table_id || null);
    }

    setHandoffItems(handoffData || []);
    return tableData;
  };

  const refreshSessionOrders = async (sessionId) => {
    if (!sessionId) {
      setActiveOrder(null);
      setSessionOrders([]);
      setChangeRequests([]);
      return;
    }

    const [order, orders] = await Promise.all([
      ordersApi.getActiveBySession(sessionId),
      ordersApi.listBySession(sessionId, "draft,confirmed,in_progress,ready_to_serve,completed"),
    ]);

    const ordersList = orders || [];
    setActiveOrder(order);
    setSessionOrders(ordersList);

    const requestTargetOrders = ordersList.filter((entry) => entry.order_status_key !== "draft");
    if (requestTargetOrders.length === 0) {
      setChangeRequests([]);
      return;
    }

    const requestLists = await Promise.all(
      requestTargetOrders.map((entry) =>
        ordersApi.listChangeRequests(entry.order_id).catch(() => []),
      ),
    );

    const merged = requestLists
      .flat()
      .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
    setChangeRequests(merged);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [menuData, tableData] = await Promise.all([menuApi.list(), refreshTablesAndHandoff()]);
      setMenuItems(menuData || []);

      const seedTable = selectedTableId
        ? tableData.find((table) => table.table_id === selectedTableId)
        : tableData[0];
      await refreshSessionOrders(seedTable?.active_session?.session_id || null);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load waiter station");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Number.isInteger(forcedTableId) && forcedTableId > 0) {
      setSelectedTableId(forcedTableId);
    }
  }, [forcedTableId]);

  useEffect(() => {
    if (!selectedTable) {
      return;
    }

    refreshSessionOrders(selectedTable.active_session?.session_id || null).catch(() => {
      setError("Failed to fetch session orders");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshTablesAndHandoff()
        .then((tableData) => {
          const table = tableData.find((entry) => entry.table_id === selectedTableId);
          return refreshSessionOrders(table?.active_session?.session_id || null);
        })
        .catch(() => {
          // Keep UI stable even if one polling cycle fails.
        });
    }, 7000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId]);

  const updateItemDraft = (menuItemId, patch) => {
    setItemDrafts((prev) => ({
      ...prev,
      [menuItemId]: {
        ...(prev[menuItemId] || fallbackDraft),
        ...patch,
      },
    }));
  };

  const updateChangeDraft = (orderItemId, patch) => {
    setChangeDrafts((prev) => ({
      ...prev,
      [orderItemId]: {
        ...(prev[orderItemId] || fallbackChangeDraft),
        ...patch,
      },
    }));
  };

  const handleTableSelect = (tableId) => {
    setSelectedTableId(tableId);
    if (typeof onSelectTable === "function") {
      onSelectTable(tableId);
    }
  };

  const ensureSession = async () => {
    const currentTable = tables.find((table) => table.table_id === selectedTableId);
    if (!currentTable) {
      throw new Error("Please select a table");
    }

    if (currentTable.active_session) {
      return currentTable.active_session.session_id;
    }

    const openedSession = await tablesApi.openSession({
      table_id: currentTable.table_id,
      customer_name: guestForm.customer_name,
      customer_phone: guestForm.customer_phone,
      party_size: Number(guestForm.party_size) || 2,
      notes: "",
    });
    await refreshTablesAndHandoff();
    return openedSession.session_id;
  };

  const ensureDraftOrder = async (sessionId) => {
    if (activeDraftOrder?.session_id === sessionId) {
      return activeDraftOrder;
    }

    const draft = await ordersApi.createDraftBySession(sessionId, {});
    await refreshSessionOrders(sessionId);
    return draft;
  };

  const addItemToOrder = async (menuItemId) => {
    try {
      setBusy(`add-${menuItemId}`);
      setError("");
      if (isAwaitingPayment) {
        throw new Error("This table is awaiting payment. Please settle bill before adding new items.");
      }
      const sessionId = await ensureSession();
      const draftOrder = await ensureDraftOrder(sessionId);
      const draft = itemDrafts[menuItemId] || fallbackDraft;

      await ordersApi.addItem(draftOrder.order_id, {
        menu_item_id: menuItemId,
        quantity: Number(draft.qty) || 1,
        note: draft.note || "",
        selected_options: {},
      });

      await refreshSessionOrders(sessionId);
      await refreshTablesAndHandoff();
      updateItemDraft(menuItemId, { note: "", qty: 1 });
    } catch (apiError) {
      setError(apiError?.response?.data?.message || apiError.message || "Cannot add item");
    } finally {
      setBusy("");
    }
  };

  const removeItemFromDraft = async (orderItemId) => {
    if (!activeDraftOrder?.order_id) {
      return;
    }
    try {
      setBusy(`remove-${orderItemId}`);
      await ordersApi.removeItem(activeDraftOrder.order_id, orderItemId);
      await refreshSessionOrders(activeDraftOrder.session_id);
      await refreshTablesAndHandoff();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Cannot remove item");
    } finally {
      setBusy("");
    }
  };

  const confirmOrder = async () => {
    if (!activeDraftOrder?.order_id) {
      return;
    }
    try {
      setBusy("confirm");
      await ordersApi.confirm(activeDraftOrder.order_id);
      await refreshSessionOrders(activeDraftOrder.session_id);
      await refreshTablesAndHandoff();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to send order");
    } finally {
      setBusy("");
    }
  };

  const submitChangeRequest = async (item) => {
    const draft = changeDrafts[item.order_item_id] || fallbackChangeDraft;

    try {
      setBusy(`change-${item.order_item_id}`);
      const payload = {
        request_type: draft.request_type,
        reason: draft.reason || "",
      };

      if (draft.request_type === "change_quantity") {
        payload.requested_quantity = Math.max(1, Number(draft.requested_quantity) || 1);
      }
      if (draft.request_type === "change_note") {
        payload.requested_note = (draft.requested_note || "").trim();
      }

      await ordersApi.createChangeRequest(item.order_id, item.order_item_id, payload);
      if (selectedSessionId) {
        await refreshSessionOrders(selectedSessionId);
      }
      updateChangeDraft(item.order_item_id, fallbackChangeDraft);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to submit change request");
    } finally {
      setBusy("");
    }
  };

  const markServed = async (orderItemId) => {
    try {
      setBusy(`served-${orderItemId}`);
      await kitchenApi.markServed(orderItemId);
      await refreshTablesAndHandoff();
      if (selectedSessionId) {
        await refreshSessionOrders(selectedSessionId);
      }
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to mark served");
    } finally {
      setBusy("");
    }
  };

  const invitePayment = async () => {
    if (!selectedSessionId) {
      return;
    }
    try {
      setBusy("invite-payment");
      setError("");
      if (typeof tablesApi.invitePayment === "function") {
        await tablesApi.invitePayment(selectedSessionId);
      } else {
        await unwrap(await http.patch(`/tables/sessions/${selectedSessionId}/invite-payment`));
      }
      await refreshTablesAndHandoff();
      await refreshSessionOrders(selectedSessionId);
    } catch (apiError) {
      setError(
        apiError?.response?.data?.message ||
          apiError?.message ||
          "Unable to invite payment",
      );
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <main className="boot-screen">
        <div className="loader" />
        <p>Preparing waiter station...</p>
      </main>
    );
  }

  const waiterLayoutClass = isTablesOnly
    ? "grid-waiter waiter-layout-tables"
    : isDetailOnly
      ? "grid-waiter waiter-layout-detail"
      : "grid-waiter waiter-layout-full";

  return (
    <main className={waiterLayoutClass}>
      {isDetailOnly ? (
        <section className="panel panel-compact waiter-detail-toolbar">
          <div className="panel-header">
            <h2>Waiter Table Detail</h2>
            <div className="manager-actions">
              <select
                value={selectedTableId || ""}
                onChange={(event) => handleTableSelect(Number(event.target.value))}
              >
                {tables.map((table) => (
                  <option key={table.table_id} value={table.table_id}>
                    {table.table_code} - {table.current_status_key}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-btn" onClick={onBackToBoard}>
                Back to table board
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!isDetailOnly ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Table Board</h2>
            <button type="button" className="ghost-btn" onClick={bootstrap}>
              Refresh
            </button>
          </div>

          <div className="table-grid">
            {tables.map((table) => (
              <button
                key={table.table_id}
                type="button"
                className={`table-card ${selectedTableId === table.table_id ? "selected" : ""}`}
                onClick={() => handleTableSelect(table.table_id)}
              >
                <strong>{table.table_code}</strong>
                <span>{table.current_status_key}</span>
                <small>
                  Ready: {table.kitchen_summary.ready} | Cooking: {table.kitchen_summary.cooking}
                </small>
                <small>
                  Session: {table.active_session?.session_status_key || "none"} | Bill:{" "}
                  {table.active_session?.bill_summary?.bill_status_key || "none"}
                </small>
              </button>
            ))}
          </div>

          {selectedTable && !selectedTable.active_session ? (
            <div className="session-box">
              <h3>Open Session for {selectedTable.table_code}</h3>
              <div className="session-form">
                <input
                  placeholder="Guest name"
                  value={guestForm.customer_name}
                  onChange={(event) =>
                    setGuestForm((prev) => ({ ...prev, customer_name: event.target.value }))
                  }
                />
                <input
                  placeholder="Phone (optional)"
                  value={guestForm.customer_phone}
                  onChange={(event) =>
                    setGuestForm((prev) => ({ ...prev, customer_phone: event.target.value }))
                  }
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={guestForm.party_size}
                  onChange={(event) =>
                    setGuestForm((prev) => ({ ...prev, party_size: event.target.value }))
                  }
                />
              </div>
              <button
                type="button"
                className="solid-btn"
                disabled={busy === "open-session"}
                onClick={async () => {
                  try {
                    setBusy("open-session");
                    const sessionId = await ensureSession();
                    await refreshSessionOrders(sessionId);
                    await refreshTablesAndHandoff();
                  } catch (apiError) {
                    setError(apiError?.response?.data?.message || "Unable to open session");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Open Session
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!isTablesOnly ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Menu & Draft</h2>
            <span className="badge">
              {activeDraftOrder?.order_no ||
                activeOrder?.order_no ||
                (isAwaitingPayment
                  ? "Awaiting payment"
                  : isServiceCompleted
                    ? "Service completed"
                    : "No order")}
            </span>
          </div>

          {isAwaitingPayment || isServiceCompleted ? (
            <p className="muted">
              Table {selectedTable?.table_code}{" "}
              {isAwaitingPayment ? "is waiting for payment." : "has completed service."}
              {selectedBillSummary
                ? ` Bill #${selectedBillSummary.bill_id} (${selectedBillSummary.bill_status_key}).`
                : isAwaitingPayment
                  ? " Manager/Cashier can open bill from Manager Console."
                  : " Waiter can invite payment or add new items to continue service."}
            </p>
          ) : null}

          <div className="menu-grid">
            {menuItems.map((item) => {
              const draft = itemDrafts[item.menu_item_id] || fallbackDraft;
              return (
                <article key={item.menu_item_id} className="menu-card">
                  <h3>{item.item_name}</h3>
                  <p>{item.short_desc || item.category_key}</p>
                  <small>
                    {item.category_key} | station: {item.station_key}
                  </small>
                  <p className="price">{formatCurrency(item.base_price)}</p>
                  <div className="menu-inputs">
                    <input
                      type="number"
                      min={1}
                      value={draft.qty}
                      onChange={(event) =>
                        updateItemDraft(item.menu_item_id, {
                          qty: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <input
                      placeholder="note"
                      value={draft.note}
                      onChange={(event) =>
                        updateItemDraft(item.menu_item_id, {
                          note: event.target.value,
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="solid-btn"
                    disabled={Boolean(busy) || isAwaitingPayment}
                    onClick={() => addItemToOrder(item.menu_item_id)}
                  >
                    {busy === `add-${item.menu_item_id}` ? "Adding..." : "Add to order"}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="order-panel">
            <h3>Current Session Orders</h3>
            {activeOrderItems.length === 0 ? (
              <p className="muted">No active items. Served items are shown in the right panel.</p>
            ) : null}

            {activeOrderItems.map((item) => {
              const pendingRequest = pendingRequestByItemId.get(item.order_item_id);
              const canRequestChange =
                ["new", "cooking", "ready"].includes(item.kitchen_status_key) && !pendingRequest;
              const draft = changeDrafts[item.order_item_id] || fallbackChangeDraft;
              const isDraftItem = item.order_id === activeDraftOrder?.order_id;

              return (
                <div key={item.order_item_id} className="order-row">
                  <div>
                    <strong>
                      {item.quantity}x {item.item_name_snapshot}
                    </strong>
                    <p>{item.note || "No note"}</p>
                    <p>
                      {item.order_no} | {item.order_status_key}
                    </p>

                    {pendingRequest ? (
                      <div className="request-pending">
                        <span className="status-pill pending">
                          {requestStatusLabel[pendingRequest.status_key]}
                        </span>
                        <small>{requestTypeLabel[pendingRequest.request_type_key]}</small>
                      </div>
                    ) : null}

                    {canRequestChange ? (
                      <div className="change-request-box">
                        <select
                          value={draft.request_type}
                          onChange={(event) =>
                            updateChangeDraft(item.order_item_id, {
                              request_type: event.target.value,
                            })
                          }
                        >
                          <option value="cancel_item">Cancel item</option>
                          <option value="change_quantity">Change quantity</option>
                          <option value="change_note">Change note</option>
                        </select>

                        {draft.request_type === "change_quantity" ? (
                          <input
                            type="number"
                            min={1}
                            value={draft.requested_quantity}
                            onChange={(event) =>
                              updateChangeDraft(item.order_item_id, {
                                requested_quantity: Math.max(1, Number(event.target.value) || 1),
                              })
                            }
                            placeholder="New qty"
                          />
                        ) : null}

                        {draft.request_type === "change_note" ? (
                          <input
                            value={draft.requested_note}
                            onChange={(event) =>
                              updateChangeDraft(item.order_item_id, {
                                requested_note: event.target.value,
                              })
                            }
                            placeholder="New note"
                          />
                        ) : null}

                        <input
                          value={draft.reason}
                          onChange={(event) =>
                            updateChangeDraft(item.order_item_id, {
                              reason: event.target.value,
                            })
                          }
                          placeholder="Reason (optional)"
                        />

                        <button
                          type="button"
                          className="ghost-btn"
                          disabled={busy === `change-${item.order_item_id}`}
                          onClick={() => submitChangeRequest(item)}
                        >
                          {busy === `change-${item.order_item_id}`
                            ? "Sending..."
                            : "Request change"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="order-row-right">
                    <span className={`status-pill ${item.kitchen_status_key}`}>
                      {item.kitchen_status_key}
                    </span>
                    <strong>{formatCurrency(item.line_subtotal)}</strong>
                    {isDraftItem ? (
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => removeItemFromDraft(item.order_item_id)}
                        disabled={busy === `remove-${item.order_item_id}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <div className="order-footer">
              <strong>Active subtotal: {formatCurrency(activeSubtotal)}</strong>
              <span className="muted">Session subtotal: {formatCurrency(sessionSubtotal)}</span>
              {orderIsDraft ? (
                <button
                  type="button"
                  className="solid-btn"
                  onClick={confirmOrder}
                  disabled={busy === "confirm"}
                >
                  {busy === "confirm" ? "Sending..." : "Send to kitchen"}
                </button>
              ) : (
                <span className="badge">
                  {isAwaitingPayment
                    ? "awaiting_payment"
                    : isServiceCompleted
                      ? "service_completed"
                      : activeOrder?.order_status_key || "no_draft"}
                </span>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!isTablesOnly ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Ready to Serve</h2>
            <span className="badge">
              Ready: {readyItemsForSelectedTable.length} | Served:{" "}
              {servedItemsForSelectedTable.length}
            </span>
          </div>

          {isServiceCompleted ? (
            <div className="manager-actions">
              <button
                type="button"
                className="solid-btn"
                disabled={busy === "invite-payment"}
                onClick={invitePayment}
              >
                {busy === "invite-payment" ? "Submitting..." : "Moi thanh toan"}
              </button>
            </div>
          ) : null}

          {readyItemsForSelectedTable.length === 0 ? (
            <p className="muted">No ready item for this table.</p>
          ) : null}

          {readyItemsForSelectedTable.map((item) => (
            <article key={item.order_item_id} className="ready-card">
              <div>
                <h3>
                  {item.quantity}x {item.item_name_snapshot}
                </h3>
                <p>
                  Table {item.table_code} | {item.order_no}
                </p>
                <small>{item.note || "No note"}</small>
              </div>

              <button
                type="button"
                className="solid-btn"
                onClick={() => markServed(item.order_item_id)}
                disabled={busy === `served-${item.order_item_id}`}
              >
                {busy === `served-${item.order_item_id}` ? "Updating..." : "Mark served"}
              </button>
            </article>
          ))}

          {servedItemsForSelectedTable.length > 0 ? (
            <div className="request-list">
              <div className="panel-header">
                <h3>Served Items</h3>
                <span className="badge">{servedItemsForSelectedTable.length}</span>
              </div>

              {servedItemsForSelectedTable.map((item) => (
                <div key={item.order_item_id} className="request-row">
                  <div>
                    <strong>
                      {item.quantity}x {item.item_name_snapshot}
                    </strong>
                    <p>
                      {item.table_code} | {item.order_no}
                    </p>
                  </div>
                  <span className="status-pill served">served</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="request-list">
            <div className="panel-header">
              <h3>Post-confirm change requests</h3>
              <span className="badge">{changeRequests.length}</span>
            </div>

            {latestRequests.length === 0 ? (
              <p className="muted">No change request for this session.</p>
            ) : null}

            {latestRequests.map((request) => (
              <div key={request.change_request_id} className="request-row">
                <div>
                  <strong>{request.item_name_snapshot}</strong>
                  <p>
                    {requestTypeLabel[request.request_type_key]} by {request.requested_by_name}
                  </p>
                </div>
                <span className={`status-pill request-${request.status_key}`}>
                  {requestStatusLabel[request.status_key] || request.status_key}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="error-banner waiter-error">{error}</p> : null}
    </main>
  );
};
