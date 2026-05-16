import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const roleRouteMap = {
  chef: "/kitchen/queue",
  manager: "/manager/billing",
  admin: "/manager/billing",
  cashier: "/cashier/checkout",
  waiter: "/waiter/tables",
  host: "/manager/billing",
};

export const ProtectedRoute = ({ roles, children }) => {
  const { booting, isAuthenticated, user } = useAuth();

  if (booting) {
    return (
      <main className="boot-screen">
        <div className="loader" />
        <p>Loading service station...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role_key)) {
    return <Navigate to={roleRouteMap[user.role_key] || "/waiter/tables"} replace />;
  }

  return children;
};
