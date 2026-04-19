import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useStateAuth } from "../context/StateProvider";
import { useEffect, useRef, useState } from "react";

const LOGIN_ROUTE_BY_ROLE = {
  customer: "customer",
  company: "company",
};

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-20 h-20 border-4 border-t-[4px] border-[#2c2f32] rounded-full animate-spin" />
    </div>
  );
}

const ProtectedRoutes = ({ user }) => {
  const { userData } = useStateAuth();
  const location = useLocation();
  const [serverStatus, setServerStatus] = useState("checking"); // checking | up | down
  const hasAlertedRef = useRef(false);

  const isAllowed = userData?.type === user;

  useEffect(() => {
    if (!isAllowed) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const backendBase =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

    const healthUrl =
      import.meta.env.VITE_BACKEND_HEALTH_URL ||
      `${String(backendBase).replace(/\/$/, "")}/api/pingServer`;

    (async () => {
      try {
        const res = await fetch(healthUrl, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`Health check failed (${res.status})`);
        if (!cancelled) setServerStatus("up");
      } catch (e) {
        if (!cancelled) setServerStatus("down");
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isAllowed]);

  // Treat "no userData yet" as loading (common when auth hydrates from storage/api)
  if (!userData) return <Spinner />;

  if (isAllowed) {
    if (serverStatus === "checking") return <Spinner />;

    if (serverStatus === "down") {
      if (!hasAlertedRef.current) {
        hasAlertedRef.current = true;
        window.alert(
          "Server is not running. Please start the server and refresh the page.",
        );
      }
      return <Navigate to="/" replace state={{ from: location }} />;
    }

    return <Outlet />;
  }

  const to = LOGIN_ROUTE_BY_ROLE[user] ?? "/login";
  return <Navigate to={to} replace state={{ from: location }} />;
};

export default ProtectedRoutes;
