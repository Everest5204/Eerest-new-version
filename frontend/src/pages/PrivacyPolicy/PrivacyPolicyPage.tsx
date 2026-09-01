import {
  useCallback,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import PrivacyPolicyIllustration from "./PrivacyPolicyIllustrations";

import {
  privacyPolicyBlocks,
  privacyPolicyHeader,
} from "./privacyPolicyContent";

import "./PrivacyPolicyPage.css";

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <main className="privacy-policy-page">
      <a
        className="privacy-policy-skip-link"
        href="#privacy-policy-content"
      >
        Skip to Privacy Policy
      </a>

      <header className="privacy-policy-topbar">
        <div className="privacy-policy-topbar-inner">
          <button
            type="button"
            className="privacy-policy-back-button"
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

            <span>Back</span>
          </button>

          <h1 id="privacy-policy-page-title">
            {privacyPolicyHeader.title}
          </h1>

          <span
            className="privacy-policy-topbar-spacer"
            aria-hidden="true"
          />
        </div>
      </header>

      <article
        id="privacy-policy-content"
        className="privacy-policy-content"
        aria-labelledby="privacy-policy-page-title"
      >
        <header className="privacy-policy-introduction">
          <p className="privacy-policy-updated">
            {privacyPolicyHeader.lastUpdated}
          </p>

          <div className="privacy-policy-paragraphs">
            {privacyPolicyHeader.paragraphs.map(
              (paragraph, index) => (
                <p key={`privacy-introduction-${index}`}>
                  {paragraph}
                </p>
              ),
            )}
          </div>
        </header>

        {privacyPolicyBlocks.map((block) => {
          if (block.type === "illustration") {
            return (
              <section
                id={block.id}
                className={[
                  "privacy-policy-vector-card",
                  `privacy-policy-vector-card--${block.illustration}`,
                ].join(" ")}
                aria-labelledby={`${block.id}-title`}
                key={block.id}
              >
                <div className="privacy-policy-vector-copy">
                  <h2 id={`${block.id}-title`}>
                    {block.title}
                  </h2>

                  <p>{block.description}</p>
                </div>

                <div className="privacy-policy-vector-visual">
                  <PrivacyPolicyIllustration
                    type={block.illustration}
                  />
                </div>
              </section>
            );
          }

          return (
            <section
              id={block.id}
              className="privacy-policy-section"
              aria-labelledby={`${block.id}-title`}
              key={block.id}
            >
              <h2 id={`${block.id}-title`}>
                {block.title}
              </h2>

              {block.paragraphs &&
                block.paragraphs.length > 0 && (
                  <div className="privacy-policy-paragraphs">
                    {block.paragraphs.map(
                      (paragraph, index) => (
                        <p
                          key={`${block.id}-paragraph-${index}`}
                        >
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                )}

              {block.points &&
                block.points.length > 0 && (
                  <ul className="privacy-policy-points">
                    {block.points.map((point) => (
                      <li key={`${block.id}-${point.label}`}>
                        <strong>{point.label}:</strong>{" "}
                        <span>{point.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          );
        })}
      </article>
    </main>
  );
};

export default PrivacyPolicyPage;