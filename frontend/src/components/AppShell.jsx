import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const roleTitleMap = {
  waiter: "Waiter Station",
  chef: "Kitchen Display",
  manager: "Manager Console",
  admin: "Manager Console",
  cashier: "Cashier Desk",
  host: "Host Station",
};

const navItemsByRole = {
  waiter: [{ to: "/waiter", label: "Waiter" }],
  chef: [{ to: "/kitchen", label: "Kitchen" }],
  cashier: [{ to: "/manager", label: "Manager" }],
  host: [{ to: "/manager", label: "Manager" }],
  manager: [
    { to: "/waiter", label: "Waiter" },
    { to: "/kitchen", label: "Kitchen" },
    { to: "/manager", label: "Manager" },
  ],
  admin: [
    { to: "/waiter", label: "Waiter" },
    { to: "/kitchen", label: "Kitchen" },
    { to: "/manager", label: "Manager" },
  ],
};

export const AppShell = ({ children }) => {
  const { user, logout } = useAuth();
  const navItems = navItemsByRole[user?.role_key] || [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BN</span>
          <div>
            <h1>BepNhip IRMS</h1>
            <p>Dat mon, bep xu ly, phuc vu nhanh</p>
          </div>
        </div>

        <div className="topbar-right">
          <nav className="role-nav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="user-chip">
            <span>{user?.full_name}</span>
            <small>{roleTitleMap[user?.role_key] || user?.role_key}</small>
          </div>

          <button type="button" className="ghost-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="content-wrap">{children}</section>
    </div>
  );
};
