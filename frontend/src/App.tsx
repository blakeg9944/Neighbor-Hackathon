import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth } from "./lib/auth";
import Bank from "./pages/Bank";
import Dashboard from "./pages/Dashboard";
import Generate from "./pages/Generate";
import Login from "./pages/Login";
import Review from "./pages/Review";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/bank" element={<Bank />} />
        <Route path="/generate" element={<Generate />} />
        <Route path="/jobs/:id/review" element={<Review />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
