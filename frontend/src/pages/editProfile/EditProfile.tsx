import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Camera,
  Globe2,
  Loader2,
  RefreshCw,
  User,
} from "lucide-react";

import useEditProfile from "./useEditProfile";
import "./EditProfile.css";

type EditProfileHeaderProps = {
  disabled?: boolean;
  onBack: () => void;
};

const EditProfileHeader = memo(
  ({
    disabled = false,
    onBack,
  }: EditProfileHeaderProps) => {
    return (
      <header className="editProfileHeader">
        <button
          type="button"
          className="editProfileBackButton"
          onClick={onBack}
          disabled={disabled}
          aria-label="Go back"
        >
          <ArrowLeft size={25} aria-hidden="true" />
        </button>

        <h1 className="editProfileTitle">Edit Profile</h1>

        <span
          className="editProfileHeaderSpace"
          aria-hidden="true"
        />
      </header>
    );
  }
);

EditProfileHeader.displayName = "EditProfileHeader";

const EditProfile = () => {
  const {
    profile,
    bio,
    profilePreviewURL,
    coverPreviewURL,

    characterCount,
    remainingCharacters,
    maxBioLength,

    isLoading,
    isSaving,
    canSave,
    error,

    changeBio,
    selectProfileImage,
    selectCoverImage,

    saveProfile,
    closeEditor,
    reloadProfile,
  } = useEditProfile();

  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const fullName = useMemo(() => {
    const name = `${profile?.first_name ?? ""} ${
      profile?.last_name ?? ""
    }`.trim();

    return name || "Everest User";
  }, [profile?.first_name, profile?.last_name]);

  const openProfilePicker = useCallback(() => {
    if (!isSaving) {
      profileInputRef.current?.click();
    }
  }, [isSaving]);

  const openCoverPicker = useCallback(() => {
    if (!isSaving) {
      coverInputRef.current?.click();
    }
  }, [isSaving]);

  const handleProfileImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0] ?? null;

      input.value = "";

      if (file) {
        selectProfileImage(file);
      }
    },
    [selectProfileImage]
  );

  const handleCoverImageChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0] ?? null;

      input.value = "";

      if (file) {
        selectCoverImage(file);
      }
    },
    [selectCoverImage]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (canSave) {
        void saveProfile();
      }
    },
    [canSave, saveProfile]
  );

  if (isLoading && !profile) {
    return (
      <main className="editProfilePage">
        <section className="editProfileShell">
          <EditProfileHeader onBack={closeEditor} />

          <div
            className="editProfileLoading"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="editProfileSpin"
              size={30}
              aria-hidden="true"
            />

            <span>Loading profile...</span>
          </div>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="editProfilePage">
        <section className="editProfileShell">
          <EditProfileHeader onBack={closeEditor} />

          <div
            className="editProfileFailed"
            role="alert"
          >
            <strong>Unable to load profile</strong>

            <p>
              {error ||
                "Your profile information could not be loaded."}
            </p>

            <button
              type="button"
              className="editProfileRetryButton"
              onClick={reloadProfile}
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="editProfilePage">
      <section
        className="editProfileShell"
        aria-busy={isSaving}
      >
        <EditProfileHeader
          onBack={closeEditor}
          disabled={isSaving}
        />

        <form
          className="editProfileForm"
          onSubmit={handleSubmit}
          noValidate
        >
          <input
            ref={profileInputRef}
            type="file"
            accept="image/*"
            onChange={handleProfileImageChange}
            disabled={isSaving}
            hidden
          />

          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverImageChange}
            disabled={isSaving}
            hidden
          />

          <section
            className="editProfileMediaSection"
            aria-label="Profile photos"
          >
            <div className="editProfileCover">
              {coverPreviewURL ? (
                <img
                  className="editProfileCoverImage"
                  src={coverPreviewURL}
                  alt={`${fullName} cover`}
                  draggable={false}
                  decoding="async"
                />
              ) : (
                <span
                  className="editProfileCoverPlaceholder"
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                className="editProfileCoverButton"
                onClick={openCoverPicker}
                disabled={isSaving}
                aria-label="Change cover photo"
              >
                <span className="editProfileCoverCamera">
                  <Camera size={19} aria-hidden="true" />
                </span>

                <span>Change Cover</span>
              </button>
            </div>

            <button
              type="button"
              className="editProfileAvatarControl"
              onClick={openProfilePicker}
              disabled={isSaving}
              aria-label="Change profile photo"
            >
              <span className="editProfileAvatar">
                {profilePreviewURL ? (
                  <img
                    src={profilePreviewURL}
                    alt={`${fullName} profile`}
                    draggable={false}
                    decoding="async"
                  />
                ) : (
                  <User
                    size={48}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                )}
              </span>

              <span className="editProfileAvatarCamera">
                <Camera size={18} aria-hidden="true" />
              </span>

              <span className="editProfileAvatarLabel">
                Change Profile Photo
              </span>
            </button>
          </section>

          <section className="editProfileBioCard">
            <label
              className="editProfileBioLabel"
              htmlFor="edit-profile-bio"
            >
              Bio
            </label>

            <div className="editProfileBioField">
              <textarea
                id="edit-profile-bio"
                className="editProfileBioInput"
                value={bio}
                onChange={(event) =>
                  changeBio(event.currentTarget.value)
                }
                placeholder="Write bio..."
                rows={4}
                disabled={isSaving}
                spellCheck
                autoCapitalize="sentences"
                aria-describedby="edit-profile-bio-counter"
              />

              <span
                id="edit-profile-bio-counter"
                className={`editProfileBioCounter ${
                  remainingCharacters <= 10
                    ? "editProfileBioCounterWarning"
                    : ""
                }`}
                aria-live="polite"
                aria-label={`${remainingCharacters} characters remaining`}
              >
                {characterCount}/{maxBioLength}
              </span>
            </div>

            <div className="editProfileVisibility">
              <span
                className="editProfileVisibilityIcon"
                aria-hidden="true"
              >
                <Globe2 size={18} />
              </span>

              <span className="editProfileVisibilityText">
                <strong>Public</strong>
                <small>
                  Your bio will be visible to everyone.
                </small>
              </span>
            </div>
          </section>

          {error ? (
            <div
              className="editProfileError"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          ) : null}

          <footer className="editProfileActions">
            <button
              type="submit"
              className="editProfileSaveButton"
              disabled={!canSave}
              aria-disabled={!canSave}
              aria-busy={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2
                    className="editProfileSpin"
                    size={20}
                    aria-hidden="true"
                  />
                  <span>Saving Changes...</span>
                </>
              ) : (
                "Save Changes"
              )}
            </button>

            <button
              type="button"
              className="editProfileCancelButton"
              onClick={closeEditor}
              disabled={isSaving}
            >
              Cancel
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
};

export default memo(EditProfile);