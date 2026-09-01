import {
  useCallback,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import AboutIllustration from "./AboutIllustrations";

import {
  aboutBlocks,
  aboutHeader,
} from "./aboutContent";

import "./AboutPage.css";

const AboutPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <main className="about-page">
      <a
        className="about-skip-link"
        href="#about-content"
      >
        Skip to About Mongosky
      </a>

      <header className="about-topbar">
        <div className="about-topbar-inner">
          <button
            type="button"
            className="about-back-button"
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

          <h1 id="about-page-title">
            {aboutHeader.title}
          </h1>

          <span
            className="about-topbar-spacer"
            aria-hidden="true"
          />
        </div>
      </header>

      <article
        id="about-content"
        className="about-content"
        aria-labelledby="about-page-title"
      >
        <header className="about-introduction">
          <div className="about-paragraphs">
            {aboutHeader.paragraphs.map(
              (paragraph, index) => (
                <p key={`about-introduction-${index}`}>
                  {paragraph}
                </p>
              ),
            )}
          </div>
        </header>

        {aboutBlocks.map((block) => {
          if (block.type === "illustration") {
            return (
              <section
                id={block.id}
                className={[
                  "about-vector-card",
                  `about-vector-card--${block.illustration}`,
                ].join(" ")}
                aria-labelledby={`${block.id}-title`}
                key={block.id}
              >
                <div className="about-vector-copy">
                  <h2 id={`${block.id}-title`}>
                    {block.title}
                  </h2>

                  <p>{block.description}</p>
                </div>

                <div className="about-vector-visual">
                  <AboutIllustration
                    type={block.illustration}
                  />
                </div>
              </section>
            );
          }

          return (
            <section
              id={block.id}
              className="about-section"
              aria-labelledby={`${block.id}-title`}
              key={block.id}
            >
              <h2 id={`${block.id}-title`}>
                {block.title}
              </h2>

              {block.paragraphs &&
                block.paragraphs.length > 0 && (
                  <div className="about-paragraphs">
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
                  <ul className="about-points">
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

export default AboutPage;