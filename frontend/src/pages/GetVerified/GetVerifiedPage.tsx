import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Users,
} from "lucide-react";

import {
  VerifiedBadge,
} from "../../components/VerifiedBadge";

export const GetVerifiedPage = () => {
  const navigate = useNavigate();

  return (
    <main
      aria-labelledby="get-verified-title"
      className="tw:min-h-dvh tw:w-full tw:bg-white
        tw:font-sans tw:text-zinc-900"
    >
      <div
        className="tw:mx-auto tw:w-full tw:max-w-xl
          tw:px-5 tw:pt-5 tw:pb-12
          tw:sm:px-8 tw:sm:pt-7"
      >
        <header className="tw:flex tw:items-center tw:gap-2">
          <button
            type="button"
            aria-label="Return to previous page"
            onClick={() => navigate(-1)}
            className="tw:flex tw:h-11 tw:w-11
              tw:shrink-0 tw:items-center tw:justify-center
              tw:rounded-full tw:border-0 tw:bg-transparent
              tw:p-0 tw:text-zinc-900 tw:cursor-pointer
              tw:touch-manipulation tw:hover:bg-zinc-100
              tw:focus-visible:outline-2
              tw:focus-visible:outline-solid
              tw:focus-visible:outline-offset-2
              tw:focus-visible:outline-rose-600"
          >
            <ArrowLeft
              size={23}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>

          <h1
            id="get-verified-title"
            className="tw:m-0 tw:text-2xl tw:font-semibold
              tw:leading-8 tw:tracking-tight"
          >
            Get Verified
          </h1>
        </header>

        <section
          aria-labelledby="get-verified-card-title"
          className="tw:mx-auto tw:mt-8 tw:w-full
            tw:max-w-sm tw:rounded-3xl tw:border
            tw:border-solid tw:border-rose-100 tw:bg-white
            tw:px-6 tw:py-10 tw:text-center tw:shadow-sm
            tw:sm:mt-10 tw:sm:px-8"
        >
          <div
            aria-hidden="true"
            className="tw:relative tw:mx-auto tw:flex
              tw:h-48 tw:w-48 tw:items-center tw:justify-center"
          >
            <div
              className="tw:absolute tw:inset-0
                tw:rounded-full tw:bg-rose-50"
            />

            <div
              className="tw:absolute tw:inset-5
                tw:rounded-full tw:border tw:border-solid
                tw:border-rose-100"
            />

            <VerifiedBadge
              size="lg"
              label="Verification badge illustration"
              className="tw:relative tw:z-10 tw:h-24 tw:w-24"
            />

            <span
              className="tw:absolute tw:right-0 tw:bottom-5
                tw:z-20 tw:flex tw:h-12 tw:w-12
                tw:items-center tw:justify-center
                tw:rounded-2xl tw:border tw:border-solid
                tw:border-rose-100 tw:bg-white
                tw:text-rose-600 tw:shadow-sm"
            >
              <Users
                size={23}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>

            <span
              className="tw:absolute tw:top-5 tw:left-4
                tw:h-3 tw:w-3 tw:rounded-full tw:bg-rose-200"
            />

            <span
              className="tw:absolute tw:top-8 tw:right-3
                tw:h-2 tw:w-2 tw:rounded-full tw:bg-rose-300"
            />

            <span
              className="tw:absolute tw:bottom-6 tw:left-2
                tw:h-2 tw:w-2 tw:rounded-full tw:bg-rose-300"
            />
          </div>

          <h2
            id="get-verified-card-title"
            className="tw:mt-7 tw:text-2xl tw:font-bold
              tw:leading-8 tw:tracking-tight tw:text-zinc-900"
          >
            1K followers
          </h2>

          <p
            className="tw:mx-auto tw:mt-3 tw:max-w-xs
              tw:text-base tw:leading-7 tw:text-zinc-600"
          >
            Reach{" "}
            <strong className="tw:font-semibold tw:text-zinc-900">
              1,000 followers
            </strong>{" "}
            to get a verified badge.
          </p>
        </section>
      </div>
    </main>
  );
};