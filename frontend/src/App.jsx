import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { KitchenPage } from "./pages/KitchenPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerPage } from "./pages/ManagerPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { WaiterTableDetailPage } from "./pages/WaiterTableDetailPage";
import { WaiterTablesPage } from "./pages/WaiterTablesPage";

const roleRouteMap = {
  chef: "/kitchen/queue",
  manager: "/manager/billing",
  admin: "/manager/billing",
  waiter: "/waiter/tables",
  cashier: "/cashier/checkout",
  host: "/manager/billing",
};

const HomeRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={roleRouteMap[user.role_key] || "/waiter/tables"} replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/waiter"
        element={
          <ProtectedRoute roles={["waiter", "manager", "admin", "host"]}>
            <AppShell>
              <Navigate to="/waiter/tables" replace />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/tables"
        element={
          <ProtectedRoute roles={["waiter", "manager", "admin", "host"]}>
            <AppShell>
              <WaiterTablesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/waiter/tables/:tableId"
        element={
          <ProtectedRoute roles={["waiter", "manager", "admin", "host"]}>
            <AppShell>
              <WaiterTableDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/kitchen"
        element={
          <ProtectedRoute roles={["chef", "manager", "admin"]}>
            <AppShell>
              <Navigate to="/kitchen/queue" replace />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/kitchen/queue"
        element={
          <ProtectedRoute roles={["chef", "manager", "admin"]}>
            <AppShell>
              <KitchenPage view="queue" />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/kitchen/changes"
        element={
          <ProtectedRoute roles={["chef", "manager", "admin"]}>
            <AppShell>
              <KitchenPage view="changes" />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["manager", "admin", "host"]}>
            <AppShell>
              <Navigate to="/manager/billing" replace />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/billing"
        element={
          <ProtectedRoute roles={["manager", "admin", "host"]}>
            <AppShell>
              <ManagerPage view="billing" />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/cashier"
        element={
          <ProtectedRoute roles={["cashier"]}>
            <AppShell>
              <Navigate to="/cashier/checkout" replace />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/cashier/checkout"
        element={
          <ProtectedRoute roles={["cashier"]}>
            <AppShell>
              <ManagerPage view="billing" />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager/admin"
        element={
          <ProtectedRoute roles={["manager", "admin"]}>
            <AppShell>
              <ManagerPage view="admin" />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
