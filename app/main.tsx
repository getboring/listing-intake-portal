import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminDashboard } from "./components/AdminDashboard";
import { IntakeForm } from "./components/IntakeForm";
import "./globals.css";

function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin")) {
    return <AdminDashboard />;
  }
  return <IntakeForm />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
