// frontend/src/App.jsx
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  return isAdmin ? <Admin /> : <Shop />;
}
