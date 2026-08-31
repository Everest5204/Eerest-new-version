import {
  useCallback,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import CommunityGuidelinesIllustration from "./CommunityGuidelinesIllustrations";

import {
  communityGuidelineBlocks,
  communityGuidelinesClosing,
  communityGuidelinesHero,
} from "./communityGuidelinesContent";

import "./CommunityGuidelinesPage.css";

const guidelineNavigationItems = communityGuidelineBlocks.flatMap(
  (block) => {
    if (block.type !== "section") {
      return [];
    }

    return [
      {
        id: block.id,
        title: block.title,
      },
    ];
  },
);

const CommunityGuidelinesPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <main className="community-guidelines-page">
      <a
        className="community-guidelines-skip-link"
        href="#community-guidelines-content"
      >
        Skip to community guidelines
      </a>

      <header className="community-guidelines-topbar">
        <div className="community-guidelines-topbar__inner">
          <button
            type="button"
            className="community-guidelines-back-button"
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

          <a
            className="community-guidelines-topbar__title"
            href="#community-guidelines-top"
          >
            Community Guidelines
          </a>

          <span
            className="community-guidelines-topbar__spacer"
            aria-hidden="true"
          />
        </div>
      </header>

      <div
        id="community-guidelines-top"
        className="community-guidelines-shell"
      >
        <section
          className="community-guidelines-hero"
          aria-labelledby="community-guidelines-title"
        >
          <div className="community-guidelines-hero__glow community-guidelines-hero__glow--one" />
          <div className="community-guidelines-hero__glow community-guidelines-hero__glow--two" />

          <div className="community-guidelines-hero__content">
            <span className="community-guidelines-hero__badge">
              <span
                className="community-guidelines-hero__badge-icon"
                aria-hidden="true"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M12 3L19 6V11C19 15.5 16.2 19.4 12 21C7.8 19.4 5 15.5 5 11V6L12 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12L11 14L15.5 9.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              {communityGuidelinesHero.badge}
            </span>

            <h1 id="community-guidelines-title">
              {communityGuidelinesHero.title}
            </h1>

            <p className="community-guidelines-hero__description">
              {communityGuidelinesHero.description}
            </p>

            <ul
              className="community-guidelines-highlights"
              aria-label="Core community principles"
            >
              {communityGuidelinesHero.highlights.map(
                (highlight) => (
                  <li key={highlight}>
                    <span aria-hidden="true">
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          fill="currentColor"
                          opacity="0.14"
                        />
                        <path
                          d="M8.5 12L10.8 14.3L15.8 9.3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>

                    {highlight}
                  </li>
                ),
              )}
            </ul>
          </div>
        </section>

        <div className="community-guidelines-layout">
          <aside className="community-guidelines-navigation">
            <div className="community-guidelines-navigation__card">
              <p className="community-guidelines-navigation__label">
                On this page
              </p>

              <nav aria-label="Community Guidelines sections">
                <ul>
                  {guidelineNavigationItems.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`}>
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>

          <article
            id="community-guidelines-content"
            className="community-guidelines-content"
          >
            {communityGuidelineBlocks.map((block) => {
              if (block.type === "illustration") {
                return (
                  <section
                    id={block.id}
                    className={[
                      "community-guidelines-illustration-card",
                      `community-guidelines-illustration-card--${block.illustration}`,
                    ].join(" ")}
                    key={block.id}
                  >
                    <div className="community-guidelines-illustration-card__copy">
                      <span className="community-guidelines-section-eyebrow">
                        {block.badge}
                      </span>

                      <h2>{block.title}</h2>

                      <p>{block.description}</p>
                    </div>

                    <div className="community-guidelines-illustration-card__visual">
                      <CommunityGuidelinesIllustration
                        type={block.illustration}
                      />
                    </div>
                  </section>
                );
              }

              return (
                <section
                  id={block.id}
                  className="community-guidelines-section"
                  key={block.id}
                >
                  <div className="community-guidelines-section__heading">
                    {block.eyebrow && (
                      <span className="community-guidelines-section-eyebrow">
                        {block.eyebrow}
                      </span>
                    )}

                    <h2>{block.title}</h2>

                    <p className="community-guidelines-section__description">
                      {block.description}
                    </p>
                  </div>

                  {block.paragraphs &&
                    block.paragraphs.length > 0 && (
                      <div className="community-guidelines-paragraphs">
                        {block.paragraphs.map((paragraph) => (
                          <p key={paragraph}>
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                  {block.rules && block.rules.length > 0 && (
                    <div className="community-guidelines-rules">
                      {block.rules.map((rule) => (
                        <div
                          className="community-guidelines-rule"
                          key={rule.title}
                        >
                          <span
                            className="community-guidelines-rule__icon"
                            aria-hidden="true"
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M12 3L19 6V11C19 15.5 16.2 19.4 12 21C7.8 19.4 5 15.5 5 11V6L12 3Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M9 12L11 14L15.5 9.5"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>

                          <div>
                            <h3>{rule.title}</h3>
                            <p>{rule.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {block.note && (
                    <aside
                      className="community-guidelines-note"
                      aria-label="Important safety information"
                    >
                      <span
                        className="community-guidelines-note__icon"
                        aria-hidden="true"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <path
                            d="M12 11V16"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <circle
                            cx="12"
                            cy="8"
                            r="1.2"
                            fill="currentColor"
                          />
                        </svg>
                      </span>

                      <p>{block.note}</p>
                    </aside>
                  )}
                </section>
              );
            })}

            <section className="community-guidelines-closing">
              <span
                className="community-guidelines-closing__icon"
                aria-hidden="true"
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M12 3L19 6V11C19 15.5 16.2 19.4 12 21C7.8 19.4 5 15.5 5 11V6L12 3Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12L11 14L15.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>

              <h2>{communityGuidelinesClosing.title}</h2>

              <p>{communityGuidelinesClosing.description}</p>

              <button
                type="button"
                className="community-guidelines-closing__button"
                onClick={handleBack}
              >
                <svg
                  width="19"
                  height="19"
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

                {communityGuidelinesClosing.primaryActionLabel}
              </button>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
};

export default CommunityGuidelinesPage;