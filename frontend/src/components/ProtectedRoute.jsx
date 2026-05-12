import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const roleRouteMap = {
  chef: "/kitchen",
  manager: "/manager",
  admin: "/manager",
  cashier: "/manager",
  waiter: "/waiter",
  host: "/manager",
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
    return <Navigate to={roleRouteMap[user.role_key] || "/waiter"} replace />;
  }

  return children;
};
