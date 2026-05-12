import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const roleRedirectMap = {
  chef: "/kitchen",
  waiter: "/waiter",
  manager: "/manager",
  admin: "/manager",
  cashier: "/manager",
  host: "/manager",
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [form, setForm] = useState({ username: "waiter01", password: "123456" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(roleRedirectMap[user.role_key] || "/waiter", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const loggedInUser = await login(form.username, form.password);
      navigate(roleRedirectMap[loggedInUser.role_key] || "/waiter", { replace: true });
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="hero-stripe" />
        <div className="login-brandline">
          <span className="product-pill">BepNhip IRMS</span>
          <small>Operations Platform</small>
        </div>

        <h1>Sign in to continue service operations</h1>
        <p>This release is production-polished for the core dining workflow.</p>

        <div className="scope-box">
          <h2>Included in this release</h2>
          <ul>
            <li>Order capture and draft confirmation by waiter.</li>
            <li>Kitchen processing pipeline: new, cooking, ready.</li>
            <li>Ready handoff and served confirmation at table.</li>
            <li>Billing, payment, and manager administrative controls.</li>
          </ul>
        </div>

        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="solid-btn" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};
