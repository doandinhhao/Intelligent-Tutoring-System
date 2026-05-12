import { Link } from "react-router-dom";

export const NotFoundPage = () => {
  return (
    <main className="boot-screen">
      <h2>Page not found</h2>
      <p className="muted">This project only includes pages for the main workflow.</p>
      <Link className="solid-btn" to="/waiter">
        Back to dashboard
      </Link>
    </main>
  );
};

