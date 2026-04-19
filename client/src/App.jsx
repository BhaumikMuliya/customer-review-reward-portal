import "./App.css";
import { Routes, Route, useLocation } from "react-router-dom";
import { Sidebar, Navbar, CallButton } from "./components";
import ProtectedRoutes from "./components/ProtectedRoutes";

import {
  ProductDetails,
  CreateProduct,
  Home,
  Profile,
  Signup,
  Login,
  CompanyHomepage,
  CompanyProfile,
  UserLogin,
  UserSignup,
  Marketplace,
  Leaderboard,
  Dex,
  About,
  FAQ,
  RouterProtocol,
  CompanyLandingPage,
} from "./pages";

import LandingPage from "./Landing/Home";
import Footer from "./Landing/Footer";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { useStateAuth } from "./context/StateProvider";
import { useEffect, useMemo, useRef, useState } from "react";

const HIDE_NAV_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/company/login",
  "/company/register",
  "/about",
  "/faq",
]);

function AppLayout({ showNav, children }) {
  return (
    <>
      <div className="relative sm:-8 p-4 bg-[#13131a] min-h-screen flex flex-row">
        {showNav && <Sidebar />}
        <CallButton />

        <div className="flex-1 max-sm:w-full max-w-[1280px] mx-auto sm:pr-5">
          {showNav && <Navbar />}
          {children}
        </div>
      </div>

      <Footer />
      <ToastContainer />
    </>
  );
}

function App() {
  const { userData } = useStateAuth();
  const { pathname } = useLocation();

  const [backendStatus, setBackendStatus] = useState("checking"); // checking | up | down
  const hasAlertedRef = useRef(false);

  const isAuthed = Boolean(userData);

  const shouldHideNav = useMemo(() => {
    return HIDE_NAV_PATHS.has(pathname);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const healthUrl =
      import.meta.env.VITE_BACKEND_HEALTH_URL || "/api/pingServer";

    (async () => {
      try {
        const res = await fetch(healthUrl, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Health check failed (${res.status})`);
        if (!cancelled) setBackendStatus("up");
      } catch (e) {
        if (!cancelled) setBackendStatus("down");
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const showNav = isAuthed && !shouldHideNav;

  if (backendStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#13131a]">
        <div className="w-20 h-20 border-4 border-t-[4px] border-[#2c2f32] rounded-full animate-spin" />
      </div>
    );
  }

  if (backendStatus === "down") {
    if (!hasAlertedRef.current) {
      hasAlertedRef.current = true;
      window.alert(
        "Backend server is not running. Please start the backend, then refresh this page.",
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#13131a] p-6">
        <div className="max-w-xl text-center">
          <p className="text-white text-lg font-semibold">
            Backend server is not running.
          </p>
          <p className="text-[#808191] mt-2">
            Start the backend server, then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  // Route definitions grouped for clarity/maintenance
  const publicRoutes = [
    { path: "/", element: <LandingPage /> },
    { path: "/login", element: <UserLogin /> },
    { path: "/register", element: <UserSignup /> },
    { path: "/company/register", element: <Signup /> },
    { path: "/company/login", element: <Login /> },
    { path: "/about", element: <About /> },
    { path: "/faq", element: <FAQ /> },
    { path: "/dex", element: <Dex /> },
    { path: "/leaderboard", element: <Leaderboard /> },
    { path: "/abc", element: <CompanyLandingPage /> },
  ];

  const customerProtectedRoutes = [
    { path: "/home", element: <Home /> },
    { path: "/profile", element: <Profile /> },
    { path: "/product-details/:id", element: <ProductDetails /> },
    { path: "/exchange", element: <RouterProtocol /> },
  ];

  const companyProtectedRoutes = [
    { path: "/company", element: <CompanyHomepage /> },
    { path: "/company/profile", element: <CompanyProfile /> },
    { path: "/company/product-details/:id", element: <ProductDetails /> }, // avoid duplicate exact same path
    { path: "/company/exchange", element: <RouterProtocol /> },
    { path: "/company/create-product", element: <CreateProduct /> },
    { path: "/company/marketplace", element: <Marketplace /> },
  ];

  return (
    <AppLayout showNav={showNav}>
      <Routes>
        {/* Public routes */}
        {publicRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}

        {/* Customer protected routes */}
        <Route element={<ProtectedRoutes user="CUSTOMER" />}>
          {customerProtectedRoutes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Route>

        {/* Company protected routes */}
        <Route element={<ProtectedRoutes user="COMPANY" />}>
          {companyProtectedRoutes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Route>
      </Routes>
    </AppLayout>
  );
}

export default App;
