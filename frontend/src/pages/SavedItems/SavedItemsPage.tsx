import {
  useCallback,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./SavedItemsPage.css";

const SavedItemsPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <main className="saved-items-page">
      <header className="saved-items-header">
        <button
          type="button"
          className="saved-items-back-button"
          aria-label="Return to previous page"
          onClick={handleBack}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <h1>Saved Items</h1>

        <span aria-hidden="true" />
      </header>

      <section className="saved-items-message">
        <p>
          This feature will be available within a few days.
        </p>
      </section>
    </main>
  );
};

export default SavedItemsPage;