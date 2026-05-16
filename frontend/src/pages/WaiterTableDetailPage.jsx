import { Navigate, useNavigate, useParams } from "react-router-dom";
import { WaiterPage } from "./WaiterPage";

export const WaiterTableDetailPage = () => {
  const navigate = useNavigate();
  const { tableId } = useParams();
  const parsed = Number(tableId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return <Navigate to="/waiter/tables" replace />;
  }

  return (
    <WaiterPage
      mode="detail"
      forcedTableId={parsed}
      onSelectTable={(nextTableId) => {
        navigate(`/waiter/tables/${nextTableId}`);
      }}
      onBackToBoard={() => {
        navigate("/waiter/tables");
      }}
    />
  );
};
