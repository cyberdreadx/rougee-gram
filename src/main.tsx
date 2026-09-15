import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./store/auth";
import { ToastProvider } from "./components/Toast";
import "./index.css";

// Native-app feel: block iOS Safari pinch-zoom. Safari ignores the viewport's
// `user-scalable=no`, so we cancel its non-standard gesture events (double-tap
// zoom is handled by `touch-action: manipulation` in index.css). Multi-touch
// touchmove is cancelled as a fallback for browsers without gesture events.
["gesturestart", "gesturechange", "gestureend"].forEach((evt) =>
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false }),
);
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
