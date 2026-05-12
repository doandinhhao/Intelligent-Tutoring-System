import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { KitchenPage } from "./pages/KitchenPage";
import { LoginPage } from "./pages/LoginPage";
import { ManagerPage } from "./pages/ManagerPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { WaiterPage } from "./pages/WaiterPage";

const roleRouteMap = {
  chef: "/kitchen",
  manager: "/manager",
  admin: "/manager",
  waiter: "/waiter",
  cashier: "/manager",
  host: "/manager",
};

const HomeRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={roleRouteMap[user.role_key] || "/waiter"} replace />;
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
              <WaiterPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/kitchen"
        element={
          <ProtectedRoute roles={["chef", "manager", "admin"]}>
            <AppShell>
              <KitchenPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["manager", "admin", "cashier", "host"]}>
            <AppShell>
              <ManagerPage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
