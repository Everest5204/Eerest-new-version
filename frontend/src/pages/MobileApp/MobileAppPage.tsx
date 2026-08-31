import {
  useCallback,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import MobileAppIllustration from "./MobileAppIllustrations";

import {
  mobileAppClosing,
  mobileAppHero,
  mobileAppIntroduction,
  mobileAppPlatformSections,
} from "./mobileAppContent";

import "./MobileAppPage.css";

const MobileAppPage = () => {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <main className="mobile-app-page">
      <a
        className="mobile-app-skip-link"
        href="#mobile-app-content"
      >
        Skip to mobile app information
      </a>

      <header className="mobile-app-topbar">
        <div className="mobile-app-topbar__inner">
          <button
            type="button"
            className="mobile-app-back-button"
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
            className="mobile-app-topbar__title"
            href="#mobile-app-top"
          >
            Mobile App
          </a>

          <span
            className="mobile-app-topbar__spacer"
            aria-hidden="true"
          />
        </div>
      </header>

      <div
        id="mobile-app-top"
        className="mobile-app-shell"
      >
        <section
          id="mobile-app-content"
          className="mobile-app-hero"
          aria-labelledby="mobile-app-title"
        >
          <div className="mobile-app-hero__copy">
            <span className="mobile-app-eyebrow">
              {mobileAppHero.eyebrow}
            </span>

            <h1 id="mobile-app-title">
              {mobileAppHero.title}
            </h1>

            <p className="mobile-app-hero__description">
              {mobileAppHero.description}
            </p>

            <p className="mobile-app-hero__supporting-text">
              {mobileAppHero.supportingText}
            </p>

            <div
              className="mobile-app-status"
              role="status"
            >
              <span
                className="mobile-app-status__indicator"
                aria-hidden="true"
              />

              <span>{mobileAppHero.statusLabel}</span>
            </div>
          </div>

          <div className="mobile-app-hero__illustration">
            <MobileAppIllustration
              type={mobileAppHero.illustration}
            />
          </div>
        </section>

        <section className="mobile-app-introduction">
          <div className="mobile-app-introduction__heading">
            <span className="mobile-app-eyebrow">
              {mobileAppIntroduction.eyebrow}
            </span>

            <h2>{mobileAppIntroduction.title}</h2>

            <p>{mobileAppIntroduction.description}</p>
          </div>

          <div className="mobile-app-introduction__paragraphs">
            {mobileAppIntroduction.paragraphs.map(
              (paragraph) => (
                <p key={paragraph}>
                  {paragraph}
                </p>
              ),
            )}
          </div>
        </section>

        <div className="mobile-app-platforms">
          {mobileAppPlatformSections.map((section) => (
            <section
              id={section.id}
              className={[
                "mobile-app-platform",
                `mobile-app-platform--${section.platform}`,
              ].join(" ")}
              key={section.id}
            >
              <div className="mobile-app-platform__illustration">
                <MobileAppIllustration
                  type={section.illustration}
                />
              </div>

              <div className="mobile-app-platform__copy">
                <span className="mobile-app-eyebrow">
                  {section.eyebrow}
                </span>

                <h2>{section.title}</h2>

                <p className="mobile-app-platform__description">
                  {section.description}
                </p>

                <div className="mobile-app-platform__paragraphs">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div
                  className="mobile-app-platform__status"
                  role="status"
                >
                  <span
                    className="mobile-app-platform__status-indicator"
                    aria-hidden="true"
                  />

                  <span>{section.statusLabel}</span>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="mobile-app-closing">
          <span className="mobile-app-eyebrow">
            {mobileAppClosing.eyebrow}
          </span>

          <h2>{mobileAppClosing.title}</h2>

          <p className="mobile-app-closing__description">
            {mobileAppClosing.description}
          </p>

          <p className="mobile-app-closing__supporting-text">
            {mobileAppClosing.supportingText}
          </p>

          <button
            type="button"
            className="mobile-app-closing__button"
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

            {mobileAppClosing.backButtonLabel}
          </button>
        </section>
      </div>
    </main>
  );
};

export default MobileAppPage;