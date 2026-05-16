import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { adminApi, billingApi, tablesApi } from "../api/irmsApi";
import { useAuth } from "../context/AuthContext";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount || 0);

const formatWaitingTime = (fromIso, nowMs) => {
  if (!fromIso) {
    return "0m";
  }
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) {
    return "0m";
  }
  const diffMs = Math.max(0, nowMs - start);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainMinutes}m`;
  }
  return `${minutes}m`;
};

const defaultBillForm = {
  manual_discount_amount: 0,
  service_charge_rate: 5,
  tax_rate: 8,
  tip_amount: 0,
  split_count: 1,
  promotion_code: "",
  adjustment_reason: "",
};

const defaultPayForm = {
  payment_method: "cash",
  paid_amount: "",
  external_txn_id: "",
};

const defaultRefundForm = {
  refund_amount: "",
  refund_reason: "",
};

const defaultPromotionForm = {
  promotion_code: "",
  promotion_name: "",
  discount_type_key: "percent",
  discount_value: 10,
  min_order_amount: 0,
  max_discount_amount: "",
};

const roleOptions = ["waiter", "chef", "cashier", "host", "manager"];

const normalizeRoleForUi = (roleKey) => (roleKey === "admin" ? "manager" : roleKey);

const defaultNewMenuItem = {
  item_name: "",
  short_desc: "",
  category_key: "main_course",
  item_type_key: "dish",
  station_key: "grill",
  availability_key: "available",
  base_price: 0,
};

export const ManagerPage = ({ view = "all" }) => {
  const { user } = useAuth();
  const canUseAdminTools = ["manager", "admin"].includes(user?.role_key);
  const isCashierView = user?.role_key === "cashier";
  const billingBasePath = isCashierView ? "/cashier/checkout" : "/manager/billing";
  const canManageSensitiveBilling = ["manager", "admin"].includes(user?.role_key);
  const canAdjustBill = ["manager", "admin", "cashier"].includes(user?.role_key);

  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [currentBill, setCurrentBill] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const [billForm, setBillForm] = useState(defaultBillForm);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [refundForm, setRefundForm] = useState(defaultRefundForm);

  const [users, setUsers] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [newUser, setNewUser] = useState({
    username: "",
    full_name: "",
    password: "123456",
    role_key: "waiter",
  });

  const [menuItems, setMenuItems] = useState([]);
  const [menuDrafts, setMenuDrafts] = useState({});
  const [newMenuItem, setNewMenuItem] = useState(defaultNewMenuItem);

  const [promotions, setPromotions] = useState([]);
  const [newPromotion, setNewPromotion] = useState(defaultPromotionForm);

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState({
    actor_user_id: "",
    action_key: "",
    entity_type_key: "",
  });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const showBilling = view !== "admin";
  const showAdmin = view !== "billing";

  const selectedTable = useMemo(
    () => tables.find((table) => table.table_id === selectedTableId) || null,
    [tables, selectedTableId],
  );
  const selectedSessionId = selectedTable?.active_session?.session_id || null;
  const selectedSessionStatus = selectedTable?.active_session?.session_status_key || null;
  const selectedBillSummary = selectedTable?.active_session?.bill_summary || null;
  const billIsOpen = currentBill?.bill_status_key === "open";
  const billIsPaid = currentBill?.bill_status_key === "paid";
  const billCanBeVoided = currentBill?.bill_status_key === "open";
  const billCanBeRefunded = currentBill?.bill_status_key === "paid";
  const awaitingPaymentTables = useMemo(
    () =>
      tables.filter((table) => table.active_session?.session_status_key === "awaiting_payment"),
    [tables],
  );
  const tablesForBillingView =
    isCashierView && awaitingPaymentTables.length > 0 ? awaitingPaymentTables : tables;

  const loadBillForSession = async (sessionId) => {
    if (!sessionId) {
      setCurrentBill(null);
      setReceipt(null);
      return;
    }
    const bill = await billingApi.getLatestBySession(sessionId);
    setCurrentBill(bill || null);
    setReceipt(null);
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all([
        tablesApi.list(),
        canUseAdminTools ? adminApi.listUsers({ limit: 120 }) : Promise.resolve([]),
        canUseAdminTools ? adminApi.listMenu() : Promise.resolve([]),
        canUseAdminTools ? adminApi.listPromotions() : Promise.resolve([]),
        canUseAdminTools
          ? adminApi.listAuditLogs({ limit: 120 })
          : Promise.resolve([]),
      ]);
      const [tableData, userData, adminMenu, promoData, logData] = results;
      setTables(tableData || []);
      setUsers(userData || []);
      setMenuItems(adminMenu || []);
      setPromotions(promoData || []);
      setAuditLogs(logData || []);

      const preferredTableId = isCashierView
        ? tableData.find((table) => table.active_session?.session_status_key === "awaiting_payment")
            ?.table_id ||
          tableData?.[0]?.table_id ||
          null
        : tableData?.[0]?.table_id || null;
      const nextTableId = selectedTableId || preferredTableId;
      setSelectedTableId(nextTableId);

      const selectedTableFromData = tableData?.find((table) => table.table_id === nextTableId);
      await loadBillForSession(selectedTableFromData?.active_session?.session_id || null);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load manager console");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedTable) {
      return;
    }
    loadBillForSession(selectedTable.active_session?.session_id || null).catch(() => {
      setError("Unable to load bill for selected table");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId]);

  const refreshTablesOnly = async () => {
    const tableData = await tablesApi.list();
    setTables(tableData || []);
    const current = tableData.find((entry) => entry.table_id === selectedTableId) || tableData[0] || null;
    setSelectedTableId(current?.table_id || null);
    await loadBillForSession(current?.active_session?.session_id || null);
  };

  const openBill = async () => {
    if (!selectedSessionId) {
      setError("Selected table has no active session");
      return;
    }
    try {
      setBusy("open-bill");
      setError("");
      const bill = await billingApi.openBySession(selectedSessionId, billForm);
      setCurrentBill(bill);
      setInfo("Bill opened");
      await refreshTablesOnly();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to open bill");
    } finally {
      setBusy("");
    }
  };

  const adjustCurrentBill = async () => {
    if (!currentBill?.bill_id) {
      return;
    }
    try {
      setBusy("adjust-bill");
      setError("");
      const bill = await billingApi.adjust(currentBill.bill_id, billForm);
      setCurrentBill(bill);
      setInfo("Bill adjusted");
      await refreshTablesOnly();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to adjust bill");
    } finally {
      setBusy("");
    }
  };

  const payCurrentBill = async () => {
    if (!currentBill?.bill_id || !billIsOpen) {
      return;
    }
    try {
      setBusy("pay-bill");
      setError("");
      const payload = {
        payment_method: payForm.payment_method,
      };
      if (payForm.paid_amount !== "") {
        payload.paid_amount = Number(payForm.paid_amount) || 0;
      }
      if (payForm.external_txn_id.trim()) {
        payload.external_txn_id = payForm.external_txn_id.trim();
      }
      const bill = await billingApi.pay(currentBill.bill_id, payload);
      setCurrentBill(bill);
      setPayForm(defaultPayForm);
      setInfo("Payment recorded");
      await refreshTablesOnly();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to record payment");
    } finally {
      setBusy("");
    }
  };

  const voidCurrentBill = async () => {
    if (!currentBill?.bill_id || !billCanBeVoided) {
      return;
    }
    const reason = window.prompt("Void reason:");
    if (!reason) {
      return;
    }
    try {
      setBusy("void-bill");
      setError("");
      const bill = await billingApi.void(currentBill.bill_id, { reason });
      setCurrentBill(bill);
      setInfo("Bill voided");
      await refreshTablesOnly();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to void bill");
    } finally {
      setBusy("");
    }
  };

  const refundCurrentBill = async () => {
    if (!currentBill?.bill_id || !billCanBeRefunded) {
      return;
    }
    if (!refundForm.refund_reason.trim()) {
      setError("Refund reason is required");
      return;
    }
    try {
      setBusy("refund-bill");
      setError("");
      const payload = {
        refund_reason: refundForm.refund_reason.trim(),
      };
      if (refundForm.refund_amount !== "") {
        payload.refund_amount = Number(refundForm.refund_amount) || 0;
      }
      const bill = await billingApi.refund(currentBill.bill_id, payload);
      setCurrentBill(bill);
      setRefundForm(defaultRefundForm);
      setInfo("Bill refunded");
      await refreshTablesOnly();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to refund bill");
    } finally {
      setBusy("");
    }
  };

  const loadReceipt = async () => {
    if (!currentBill?.bill_id) {
      return;
    }
    try {
      setBusy("load-receipt");
      const data = await billingApi.receipt(currentBill.bill_id);
      setReceipt(data);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to load receipt");
    } finally {
      setBusy("");
    }
  };

  const saveUserUpdate = async (user) => {
    const draft = userDrafts[user.user_id];
    if (!draft) {
      return;
    }
    try {
      setBusy(`user-${user.user_id}`);
      setError("");
      await adminApi.updateUser(user.user_id, draft);
      const list = await adminApi.listUsers({ limit: 120 });
      setUsers(list || []);
      setInfo("User updated");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to update user");
    } finally {
      setBusy("");
    }
  };

  const createUser = async () => {
    try {
      setBusy("create-user");
      setError("");
      await adminApi.createUser(newUser);
      const list = await adminApi.listUsers({ limit: 120 });
      setUsers(list || []);
      setNewUser({
        username: "",
        full_name: "",
        password: "123456",
        role_key: "waiter",
      });
      setInfo("User created");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to create user");
    } finally {
      setBusy("");
    }
  };

  const saveMenuItem = async (item) => {
    const draft = menuDrafts[item.menu_item_id];
    if (!draft) {
      return;
    }
    try {
      setBusy(`menu-${item.menu_item_id}`);
      setError("");
      await adminApi.updateMenu(item.menu_item_id, draft);
      const data = await adminApi.listMenu();
      setMenuItems(data || []);
      setInfo("Menu updated");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to update menu");
    } finally {
      setBusy("");
    }
  };

  const createMenuItem = async () => {
    try {
      setBusy("create-menu-item");
      setError("");
      await adminApi.createMenu({
        item_name: newMenuItem.item_name.trim(),
        short_desc: newMenuItem.short_desc.trim(),
        category_key: newMenuItem.category_key.trim(),
        item_type_key: newMenuItem.item_type_key.trim(),
        station_key: newMenuItem.station_key.trim(),
        availability_key: newMenuItem.availability_key,
        base_price: Math.max(0, Number(newMenuItem.base_price) || 0),
        options_json: [],
        recipe_json: [],
      });
      const data = await adminApi.listMenu();
      setMenuItems(data || []);
      setNewMenuItem(defaultNewMenuItem);
      setInfo("Menu item created");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to create menu item");
    } finally {
      setBusy("");
    }
  };

  const createPromotion = async () => {
    try {
      setBusy("create-promo");
      setError("");
      await adminApi.createPromotion({
        ...newPromotion,
        discount_value: Number(newPromotion.discount_value) || 0,
        min_order_amount: Number(newPromotion.min_order_amount) || 0,
        max_discount_amount:
          newPromotion.max_discount_amount === ""
            ? null
            : Number(newPromotion.max_discount_amount) || 0,
      });
      const data = await adminApi.listPromotions();
      setPromotions(data || []);
      setNewPromotion(defaultPromotionForm);
      setInfo("Promotion created");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to create promotion");
    } finally {
      setBusy("");
    }
  };

  const togglePromotion = async (promotion) => {
    try {
      setBusy(`promo-${promotion.promotion_id}`);
      await adminApi.updatePromotion(promotion.promotion_id, {
        is_active: !promotion.is_active,
      });
      const data = await adminApi.listPromotions();
      setPromotions(data || []);
      setInfo("Promotion updated");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to update promotion");
    } finally {
      setBusy("");
    }
  };

  const searchAudit = async () => {
    try {
      setBusy("search-audit");
      const params = {};
      if (auditFilter.actor_user_id) {
        params.actor_user_id = Number(auditFilter.actor_user_id);
      }
      if (auditFilter.action_key.trim()) {
        params.action_key = auditFilter.action_key.trim();
      }
      if (auditFilter.entity_type_key.trim()) {
        params.entity_type_key = auditFilter.entity_type_key.trim();
      }
      params.limit = 120;
      const data = await adminApi.listAuditLogs(params);
      setAuditLogs(data || []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to search audit logs");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <main className="boot-screen">
        <div className="loader" />
        <p>Preparing manager console...</p>
      </main>
    );
  }

  const visiblePanelCount =
    (showBilling ? 1 : 0) + (showAdmin && canUseAdminTools ? 1 : 0);
  const managerLayoutClass =
    visiblePanelCount <= 1 ? "manager-grid manager-grid-lite" : "manager-grid";

  return (
    <main className={managerLayoutClass}>
      {showBilling ? (
        <section className="panel manager-billing">
        <div className="panel-header">
          <h2>{isCashierView ? "Cashier Checkout" : "Billing and Settlement"}</h2>
          <div className="manager-actions">
            {!isCashierView ? (
              <nav className="role-nav">
                <NavLink to={billingBasePath}>Billing</NavLink>
                {canUseAdminTools ? <NavLink to="/manager/admin">Admin tools</NavLink> : null}
              </nav>
            ) : null}
            <button type="button" className="ghost-btn" onClick={bootstrap}>
              Refresh
            </button>
          </div>
        </div>

        {isCashierView ? (
          <p className="muted">
            Cashier view is optimized for payment queue: open bill, collect payment, and print receipt.
          </p>
        ) : null}

        <div className="admin-block">
          <h3>Tables Waiting for Payment</h3>
          {awaitingPaymentTables.length === 0 ? (
            <p className="muted">No table is waiting for payment.</p>
          ) : null}
          <div className="admin-list">
            {awaitingPaymentTables.map((table) => (
              <button
                key={table.table_id}
                type="button"
                className="admin-row"
                onClick={() => setSelectedTableId(table.table_id)}
              >
                <strong>{table.table_code}</strong>
                <span>session #{table.active_session?.session_id}</span>
                <span>waiting {formatWaitingTime(table.active_session?.ended_at, nowMs)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="table-grid">
          {tablesForBillingView.map((table) => (
            <button
              key={table.table_id}
              type="button"
              className={`table-card ${selectedTableId === table.table_id ? "selected" : ""}`}
              onClick={() => setSelectedTableId(table.table_id)}
            >
              <strong>{table.table_code}</strong>
              <span>{table.current_status_key}</span>
              <small>
                Session: {table.active_session?.session_status_key || "none"} | Bill:{" "}
                {table.active_session?.bill_summary?.bill_status_key || "none"}
              </small>
            </button>
          ))}
        </div>

        <div className="manager-bill-box">
          <h3>Selected Table Snapshot</h3>
          {selectedTable ? (
            <p>
              {selectedTable.table_code} | session {selectedSessionId || "none"} | table status{" "}
              {selectedTable.current_status_key}
            </p>
          ) : (
            <p className="muted">No table selected</p>
          )}

          {selectedBillSummary ? (
            <p>
              Latest bill #{selectedBillSummary.bill_id} | {selectedBillSummary.bill_status_key} |{" "}
              {formatCurrency(selectedBillSummary.total_amount)}
            </p>
          ) : null}
          {selectedSessionId ? (
            <p>Session status: {selectedSessionStatus}</p>
          ) : null}
        </div>

        <div className="manager-form-grid">
            <label>
              Promo code
              <input
                value={billForm.promotion_code}
                onChange={(event) =>
                  setBillForm((prev) => ({ ...prev, promotion_code: event.target.value }))
                }
                placeholder="HAPPY10"
              />
            </label>
            <label>
              Manual discount
              <input
                type="number"
                min={0}
                value={billForm.manual_discount_amount}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    manual_discount_amount: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Service rate %
              <input
                type="number"
                min={0}
                max={50}
                value={billForm.service_charge_rate}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    service_charge_rate: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Tax rate %
              <input
                type="number"
                min={0}
                max={50}
                value={billForm.tax_rate}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    tax_rate: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Tip
              <input
                type="number"
                min={0}
                value={billForm.tip_amount}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    tip_amount: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
            <label>
              Split count
              <input
                type="number"
                min={1}
                max={20}
                value={billForm.split_count}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    split_count: Math.max(1, Number(event.target.value) || 1),
                  }))
                }
              />
            </label>
            <label className="full-row">
              Adjustment reason
              <input
                value={billForm.adjustment_reason}
                onChange={(event) =>
                  setBillForm((prev) => ({ ...prev, adjustment_reason: event.target.value }))
                }
                placeholder="Reason for discount/adjustment"
              />
            </label>
          </div>

        <div className="manager-actions">
          <button
            type="button"
            className="solid-btn"
            disabled={
              busy === "open-bill" ||
              !selectedSessionId ||
              selectedSessionStatus !== "awaiting_payment"
            }
            onClick={openBill}
          >
            {busy === "open-bill" ? "Opening..." : "Open bill for session"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!canAdjustBill || !currentBill || busy === "adjust-bill"}
            onClick={adjustCurrentBill}
          >
            {busy === "adjust-bill" ? "Saving..." : "Apply adjustment"}
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!currentBill || busy === "load-receipt"}
            onClick={loadReceipt}
          >
            {busy === "load-receipt" ? "Loading..." : "View receipt"}
          </button>
        </div>

        {currentBill ? (
          <div className="manager-current-bill">
            <h3>Bill #{currentBill.bill_id}</h3>
            <p>
              Status: {currentBill.bill_status_key} | Payment: {currentBill.payment_status_key}
            </p>
            <p>
              Subtotal {formatCurrency(currentBill.subtotal_amount)} | Discount{" "}
              {formatCurrency(currentBill.discount_amount)}
            </p>
            <p>
              Service {formatCurrency(currentBill.service_charge_amount)} | Tax{" "}
              {formatCurrency(currentBill.tax_amount)} | Tip {formatCurrency(currentBill.tip_amount)}
            </p>
            <p>
              Total <strong>{formatCurrency(currentBill.total_amount)}</strong> | Paid{" "}
              {formatCurrency(currentBill.paid_amount)}
            </p>
            <p>
              Split: {currentBill.split_count} x{" "}
              {formatCurrency(Math.round(currentBill.total_amount / currentBill.split_count))}
            </p>

            <div className="manager-form-grid">
              <label>
                Payment method
                <select
                  value={payForm.payment_method}
                  onChange={(event) =>
                    setPayForm((prev) => ({ ...prev, payment_method: event.target.value }))
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="digital_wallet">Digital wallet</option>
                </select>
              </label>
              <label>
                Paid amount (optional)
                <input
                  type="number"
                  min={0}
                  value={payForm.paid_amount}
                  onChange={(event) =>
                    setPayForm((prev) => ({ ...prev, paid_amount: event.target.value }))
                  }
                  placeholder="Leave empty for full amount"
                />
              </label>
              <label>
                External transaction id
                <input
                  value={payForm.external_txn_id}
                  onChange={(event) =>
                    setPayForm((prev) => ({ ...prev, external_txn_id: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="manager-actions">
              <button
                type="button"
                className="solid-btn"
                disabled={busy === "pay-bill" || !billIsOpen}
                onClick={payCurrentBill}
              >
                {busy === "pay-bill" ? "Processing..." : "Record payment"}
              </button>
              {canManageSensitiveBilling ? (
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy === "void-bill" || !billCanBeVoided}
                  onClick={voidCurrentBill}
                >
                  {busy === "void-bill" ? "Voiding..." : "Void bill"}
                </button>
              ) : null}
            </div>

            {!billIsOpen ? (
              <p className="muted">
                This bill is <strong>{currentBill.bill_status_key}</strong>. Payment/Void is only available
                when bill status is <strong>open</strong>.
              </p>
            ) : null}

            {canManageSensitiveBilling ? (
              <div className="manager-form-grid">
                <label>
                  Refund amount
                  <input
                    type="number"
                    min={0}
                    value={refundForm.refund_amount}
                    onChange={(event) =>
                      setRefundForm((prev) => ({ ...prev, refund_amount: event.target.value }))
                    }
                  />
                </label>
                <label className="full-row">
                  Refund reason
                  <input
                    value={refundForm.refund_reason}
                    onChange={(event) =>
                      setRefundForm((prev) => ({ ...prev, refund_reason: event.target.value }))
                    }
                    placeholder="Reason for refund"
                  />
                </label>
                <button
                  type="button"
                  className="danger-btn"
                  disabled={busy === "refund-bill" || !billCanBeRefunded}
                  onClick={refundCurrentBill}
                >
                  {busy === "refund-bill" ? "Refunding..." : "Refund bill"}
                </button>
              </div>
            ) : null}

            {canManageSensitiveBilling && currentBill && !billIsPaid ? (
              <p className="muted">
                Refund is only available when bill status is <strong>paid</strong>.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="muted">
            No bill yet for this table/session.
            {selectedSessionId && selectedSessionStatus !== "awaiting_payment"
              ? " Bill can be opened after waiter clicks 'Moi thanh toan'."
              : ""}
            {!selectedSessionId && isCashierView
              ? " Select a table in 'awaiting payment' to continue checkout."
              : ""}
          </p>
        )}

        {receipt ? (
          <pre className="receipt-box">{receipt.receipt_text}</pre>
        ) : null}
        </section>
      ) : null}

      {showAdmin && canUseAdminTools ? (
        <section className="panel manager-admin">
          <div className="panel-header">
            <h2>Administrative Tools</h2>
            <div className="manager-actions">
              <nav className="role-nav">
                <NavLink to="/manager/billing">Billing</NavLink>
                <NavLink to="/manager/admin">Admin tools</NavLink>
              </nav>
              <span className="badge">RBAC + Menu + Promo + Audit</span>
            </div>
          </div>

        <div className="admin-block">
          <h3>User Accounts</h3>
          <div className="admin-inline-form">
            <input
              placeholder="username"
              value={newUser.username}
              onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
            />
            <input
              placeholder="full name"
              value={newUser.full_name}
              onChange={(event) => setNewUser((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <select
              value={newUser.role_key}
              onChange={(event) => setNewUser((prev) => ({ ...prev, role_key: event.target.value }))}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="solid-btn"
              disabled={busy === "create-user"}
              onClick={createUser}
            >
              {busy === "create-user" ? "Creating..." : "Create user"}
            </button>
          </div>

          <div className="admin-list">
            {users.slice(0, 16).map((user) => {
              const draft = userDrafts[user.user_id] || {};
              return (
                <div key={user.user_id} className="admin-row">
                  <strong>
                    {user.username} ({user.full_name})
                  </strong>
                  <select
                    value={normalizeRoleForUi(draft.role_key || user.role_key)}
                    onChange={(event) =>
                      setUserDrafts((prev) => ({
                        ...prev,
                        [user.user_id]: { ...(prev[user.user_id] || {}), role_key: event.target.value },
                      }))
                    }
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.status_key || user.status_key}
                    onChange={(event) =>
                      setUserDrafts((prev) => ({
                        ...prev,
                        [user.user_id]: {
                          ...(prev[user.user_id] || {}),
                          status_key: event.target.value,
                        },
                      }))
                    }
                  >
                    <option value="active">active</option>
                    <option value="locked">locked</option>
                  </select>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={busy === `user-${user.user_id}`}
                    onClick={() => saveUserUpdate(user)}
                  >
                    Save
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-block">
          <h3>Menu and Price Management</h3>
          <div className="admin-inline-form">
            <input
              placeholder="Item name"
              value={newMenuItem.item_name}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, item_name: event.target.value }))
              }
            />
            <input
              placeholder="Short description"
              value={newMenuItem.short_desc}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, short_desc: event.target.value }))
              }
            />
            <input
              placeholder="Category"
              value={newMenuItem.category_key}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, category_key: event.target.value }))
              }
            />
            <input
              placeholder="Item type"
              value={newMenuItem.item_type_key}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, item_type_key: event.target.value }))
              }
            />
            <input
              placeholder="Station"
              value={newMenuItem.station_key}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, station_key: event.target.value }))
              }
            />
            <input
              type="number"
              min={0}
              placeholder="Base price"
              value={newMenuItem.base_price}
              onChange={(event) =>
                setNewMenuItem((prev) => ({
                  ...prev,
                  base_price: Math.max(0, Number(event.target.value) || 0),
                }))
              }
            />
            <select
              value={newMenuItem.availability_key}
              onChange={(event) =>
                setNewMenuItem((prev) => ({ ...prev, availability_key: event.target.value }))
              }
            >
              <option value="available">available</option>
              <option value="unavailable">unavailable</option>
            </select>
            <button
              type="button"
              className="solid-btn"
              disabled={busy === "create-menu-item"}
              onClick={createMenuItem}
            >
              {busy === "create-menu-item" ? "Creating..." : "Add menu item"}
            </button>
          </div>
          <div className="admin-list">
            {menuItems.map((item) => {
              const draft = menuDrafts[item.menu_item_id] || {};
              return (
                <div key={item.menu_item_id} className="admin-row">
                  <strong>{item.item_name}</strong>
                  <input
                    type="number"
                    min={0}
                    value={draft.base_price ?? item.base_price}
                    onChange={(event) =>
                      setMenuDrafts((prev) => ({
                        ...prev,
                        [item.menu_item_id]: {
                          ...(prev[item.menu_item_id] || {}),
                          base_price: Number(event.target.value) || 0,
                        },
                      }))
                    }
                  />
                  <select
                    value={draft.availability_key || item.availability_key}
                    onChange={(event) =>
                      setMenuDrafts((prev) => ({
                        ...prev,
                        [item.menu_item_id]: {
                          ...(prev[item.menu_item_id] || {}),
                          availability_key: event.target.value,
                        },
                      }))
                    }
                  >
                    <option value="available">available</option>
                    <option value="unavailable">unavailable</option>
                  </select>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={busy === `menu-${item.menu_item_id}`}
                    onClick={() => saveMenuItem(item)}
                  >
                    Save
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-block">
          <h3>Promotions</h3>
          <div className="admin-inline-form">
            <input
              placeholder="code"
              value={newPromotion.promotion_code}
              onChange={(event) =>
                setNewPromotion((prev) => ({ ...prev, promotion_code: event.target.value.toUpperCase() }))
              }
            />
            <input
              placeholder="name"
              value={newPromotion.promotion_name}
              onChange={(event) =>
                setNewPromotion((prev) => ({ ...prev, promotion_name: event.target.value }))
              }
            />
            <select
              value={newPromotion.discount_type_key}
              onChange={(event) =>
                setNewPromotion((prev) => ({ ...prev, discount_type_key: event.target.value }))
              }
            >
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
            <input
              type="number"
              min={0}
              placeholder="value"
              value={newPromotion.discount_value}
              onChange={(event) =>
                setNewPromotion((prev) => ({
                  ...prev,
                  discount_value: Number(event.target.value) || 0,
                }))
              }
            />
            <button
              type="button"
              className="solid-btn"
              disabled={busy === "create-promo"}
              onClick={createPromotion}
            >
              {busy === "create-promo" ? "Creating..." : "Add promo"}
            </button>
          </div>

          <div className="admin-list">
            {promotions.map((promo) => (
              <div key={promo.promotion_id} className="admin-row">
                <strong>
                  {promo.promotion_code} - {promo.promotion_name}
                </strong>
                <span>
                  {promo.discount_type_key} {promo.discount_value}
                </span>
                <span>{promo.is_active ? "active" : "inactive"}</span>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy === `promo-${promo.promotion_id}`}
                  onClick={() => togglePromotion(promo)}
                >
                  Toggle
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-block">
          <h3>Audit Logs</h3>
          <div className="admin-inline-form">
            <input
              placeholder="actor user id"
              value={auditFilter.actor_user_id}
              onChange={(event) =>
                setAuditFilter((prev) => ({ ...prev, actor_user_id: event.target.value }))
              }
            />
            <input
              placeholder="action key"
              value={auditFilter.action_key}
              onChange={(event) =>
                setAuditFilter((prev) => ({ ...prev, action_key: event.target.value }))
              }
            />
            <input
              placeholder="entity type"
              value={auditFilter.entity_type_key}
              onChange={(event) =>
                setAuditFilter((prev) => ({ ...prev, entity_type_key: event.target.value }))
              }
            />
            <button
              type="button"
              className="ghost-btn"
              disabled={busy === "search-audit"}
              onClick={searchAudit}
            >
              Search
            </button>
          </div>

          <div className="audit-list">
            {auditLogs.slice(0, 25).map((log) => (
              <div key={log.audit_log_id} className="audit-row">
                <strong>{log.action_key}</strong>
                <p>
                  actor #{log.actor_user_id} ({log.actor_username}) | {log.entity_type_key} #
                  {log.entity_id}
                </p>
                <small>{new Date(log.created_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>
        </section>
      ) : null}

      {showAdmin && !canUseAdminTools ? (
        <section className="panel">
          <p className="muted">You do not have permission to view administrative tools.</p>
        </section>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}
      {info ? <p className="info-banner">{info}</p> : null}
    </main>
  );
};
