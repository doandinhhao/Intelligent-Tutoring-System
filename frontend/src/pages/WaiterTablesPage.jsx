import { useNavigate } from "react-router-dom";
import { WaiterPage } from "./WaiterPage";

export const WaiterTablesPage = () => {
  const navigate = useNavigate();
  return (
    <WaiterPage
      mode="tables"
      onSelectTable={(tableId) => {
        navigate(`/waiter/tables/${tableId}`);
      }}
    />
  );
};
