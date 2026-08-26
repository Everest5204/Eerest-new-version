import {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  LoaderCircle,
  RefreshCw,
  Search as SearchIcon,
  User,
  UserRoundSearch,
  X,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

import Navbar from "../../components/Navbar/Navbar";
import BottomNav from "../../components/BottomNav/BottomNav";
import { ProfileLink } from "../../profileView";

import {
  searchUsers,
} from "../../services/searchService";

import type {
  SearchUser,
} from "../../services/searchService";

import "./Search.css";

const SEARCH_DELAY_MS = 180;

type SearchStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

type UserAvatarProps = {
  user: SearchUser;
};

const getFullName = (user: SearchUser) =>
  [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

const getInitials = (user: SearchUser) => {
  const initials = [user.first_name, user.last_name]
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name.trim().charAt(0).toUpperCase())
    .join("");

  return initials || "U";
};

const UserAvatar = ({ user }: UserAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const fullName = getFullName(user) || "Everest user";

  return (
    <div
      className="user-search-result__avatar"
      aria-hidden="true"
    >
      <span>{getInitials(user)}</span>

      {user.profile_image_url && !imageFailed ? (
        <img
          src={user.profile_image_url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          title={fullName}
        />
      ) : null}
    </div>
  );
};

const SearchPage = () => {
  const navigate = useNavigate();
  const latestRequestRef = useRef(0);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [retryVersion, setRetryVersion] = useState(0);

  const normalizedQuery = query
    .trim()
    .replace(/\s+/g, " ");

  useEffect(() => {
    if (!sessionStorage.getItem("token")) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!normalizedQuery) {
      latestRequestRef.current += 1;
      return;
    }

    if (!sessionStorage.getItem("token")) {
      return;
    }

    const requestID = latestRequestRef.current + 1;
    latestRequestRef.current = requestID;

    const controller = new AbortController();

    const timerID = window.setTimeout(async () => {
      try {
        const response = await searchUsers(
          normalizedQuery,
          controller.signal,
        );

        if (
          controller.signal.aborted ||
          requestID !== latestRequestRef.current
        ) {
          return;
        }

        setUsers(response.users);
        setStatus("success");
      } catch {
        if (
          controller.signal.aborted ||
          requestID !== latestRequestRef.current
        ) {
          return;
        }

        if (!sessionStorage.getItem("token")) {
          navigate("/login", { replace: true });
          return;
        }

        setUsers([]);
        setStatus("error");
      }
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timerID);
      controller.abort();
    };
  }, [navigate, normalizedQuery, retryVersion]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const clearSearch = () => {
    setQuery("");
    setUsers([]);
    setStatus("idle");
  };

  return (
    <>
      <Navbar />

      <main className="user-search-page">
        <section
          className="user-search-panel"
          aria-labelledby="user-search-title"
        >
          <header className="user-search-header">
            <h1 id="user-search-title">Search</h1>
          </header>

          <form
            className="user-search-form"
            role="search"
            onSubmit={handleSubmit}
          >
            <label
              className="user-search-sr-only"
              htmlFor="user-search-input"
            >
              Search users by name
            </label>

            <SearchIcon
              className="user-search-form__icon"
              size={22}
              aria-hidden="true"
            />

            <input
              id="user-search-input"
              type="search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;

                setQuery(nextQuery);
                setUsers([]);
                setStatus(nextQuery.trim() ? "loading" : "idle");
              }}
              placeholder="Search people..."
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />

            {status === "loading" ? (
              <LoaderCircle
                className="user-search-form__loader"
                size={21}
                aria-label="Searching"
              />
            ) : query ? (
              <button
                className="user-search-form__clear"
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
              >
                <X size={19} aria-hidden="true" />
              </button>
            ) : null}
          </form>

          <div
            className="user-search-content"
            aria-live="polite"
            aria-busy={status === "loading"}
          >
            {status === "idle" ? (
              <div className="user-search-state">
                <div className="user-search-state__icon">
                  <UserRoundSearch
                    size={70}
                    strokeWidth={1.55}
                  />
                </div>

                <h2>Search for people</h2>
                <p>
                  Enter a first name or last name to get started.
                </p>
              </div>
            ) : null}

            {status === "loading" ? (
              <div
                className="user-search-skeleton-list"
                aria-label="Searching users"
              >
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    className="user-search-skeleton"
                    key={index}
                    aria-hidden="true"
                  >
                    <span className="user-search-skeleton__avatar" />

                    <span className="user-search-skeleton__text">
                      <i />
                      <i />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {status === "success" && users.length > 0 ? (
              <div className="user-search-results">
                <div className="user-search-results__summary">
                  <h2>People</h2>

                  <span>
                    {users.length}{" "}
                    {users.length === 1
                      ? "result"
                      : "results"}
                  </span>
                </div>

                <div className="user-search-results__list">
                  {users.map((user) => {
                    const fullName =
                      getFullName(user) || "Everest user";

                    const profileTitle =
                      user.profile_title?.trim();

                    return (
                      <ProfileLink
                        key={user.id}
                        userID={user.id}
                        className="user-search-result"
                        ariaLabel={`Open ${fullName}'s profile`}
                      >
                        <UserAvatar user={user} />

                        <div className="user-search-result__info">
                          <h3>{fullName}</h3>

                          {profileTitle ? (
                            <p>{profileTitle}</p>
                          ) : null}
                        </div>
                      </ProfileLink>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {status === "success" && users.length === 0 ? (
              <div className="user-search-state">
                <div className="user-search-state__icon">
                  <User
                    size={39}
                    strokeWidth={1.8}
                  />
                </div>

                <h2>No users found</h2>

                <p>
                  No account matches “{normalizedQuery}”. Try another
                  name.
                </p>
              </div>
            ) : null}

            {status === "error" ? (
              <div className="user-search-state">
                <div className="user-search-state__icon user-search-state__icon--error">
                  <SearchIcon
                    size={39}
                    strokeWidth={1.8}
                  />
                </div>

                <h2>Search unavailable</h2>
                <p>Please check your connection and try again.</p>

                <button
                  className="user-search-retry"
                  type="button"
                  onClick={() => {
                    setUsers([]);
                    setStatus("loading");
                    setRetryVersion(
                      (version) => version + 1,
                    );
                  }}
                >
                  <RefreshCw
                    size={17}
                    aria-hidden="true"
                  />
                  Try again
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <BottomNav />
    </>
  );
};

export default memo(SearchPage);