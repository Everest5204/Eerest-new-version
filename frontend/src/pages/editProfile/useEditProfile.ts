import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  uploadCoverImage,
  uploadProfileImage,
  type UpdatedUserResponse,
} from "../../services/profileMediaService";

import {
  MAX_PROFILE_BIO_LENGTH,
  countProfileBioCharacters,
  getEditableProfile,
  getProfileEditErrorMessage,
  isProfileEditCancelled,
  normalizeProfileBio,
  publishProfileUpdate,
  updateProfileBio,
  type EditableProfile,
} from "./profileEditService";

type EditProfileLocationState = {
  returnTo?: string;
};

type ImageUploadKind =
  | "profile"
  | "cover";

type ImageUploadTask = {
  kind: ImageUploadKind;

  promise:
    Promise<UpdatedUserResponse>;
};

export type UseEditProfileResult = {
  profile:
    EditableProfile | null;

  bio: string;

  profilePreviewURL: string;
  coverPreviewURL: string;

  characterCount: number;
  remainingCharacters: number;
  maxBioLength: number;

  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  canSave: boolean;

  error: string | null;

  changeBio: (
    value: string,
  ) => void;

  selectProfileImage: (
    file: File | null,
  ) => void;

  selectCoverImage: (
    file: File | null,
  ) => void;

  saveProfile:
    () => Promise<void>;

  closeEditor: () => void;
  reloadProfile: () => void;
};

const isImageFile = (
  file: File,
): boolean => {
  return file.type.startsWith(
    "image/",
  );
};

const getUploadedImageURL = (
  kind: ImageUploadKind,
  response: UpdatedUserResponse,
): string => {
  if (kind === "profile") {
    return (
      response.profile_image_url
        ?.trim() ?? ""
    );
  }

  return (
    response.cover_image_url
      ?.trim() ?? ""
  );
};

const getUploadLabel = (
  kind: ImageUploadKind,
): string => {
  return kind === "profile"
    ? "Profile image"
    : "Cover image";
};

const useEditProfile =
  (): UseEditProfileResult => {
    const navigate =
      useNavigate();

    const location =
      useLocation();

    const mountedRef =
      useRef(false);

    const profileObjectURLRef =
      useRef<string | null>(
        null,
      );

    const coverObjectURLRef =
      useRef<string | null>(
        null,
      );

    const [
      profile,
      setProfile,
    ] =
      useState<EditableProfile | null>(
        null,
      );

    const [
      bio,
      setBio,
    ] = useState("");

    const [
      originalBio,
      setOriginalBio,
    ] = useState("");

    const [
      profileImageFile,
      setProfileImageFile,
    ] =
      useState<File | null>(
        null,
      );

    const [
      coverImageFile,
      setCoverImageFile,
    ] =
      useState<File | null>(
        null,
      );

    const [
      profilePreviewURL,
      setProfilePreviewURL,
    ] = useState("");

    const [
      coverPreviewURL,
      setCoverPreviewURL,
    ] = useState("");

    const [
      isLoading,
      setIsLoading,
    ] = useState(true);

    const [
      isSaving,
      setIsSaving,
    ] = useState(false);

    const [
      error,
      setError,
    ] =
      useState<string | null>(
        null,
      );

    const [
      reloadVersion,
      setReloadVersion,
    ] = useState(0);

    const revokeProfileObjectURL =
      useCallback(() => {
        const objectURL =
          profileObjectURLRef.current;

        if (!objectURL) {
          return;
        }

        URL.revokeObjectURL(
          objectURL,
        );

        profileObjectURLRef.current =
          null;
      }, []);

    const revokeCoverObjectURL =
      useCallback(() => {
        const objectURL =
          coverObjectURLRef.current;

        if (!objectURL) {
          return;
        }

        URL.revokeObjectURL(
          objectURL,
        );

        coverObjectURLRef.current =
          null;
      }, []);

    const setServerProfilePreview =
      useCallback(
        (url: string) => {
          revokeProfileObjectURL();

          setProfilePreviewURL(
            url,
          );
        },
        [
          revokeProfileObjectURL,
        ],
      );

    const setServerCoverPreview =
      useCallback(
        (url: string) => {
          revokeCoverObjectURL();

          setCoverPreviewURL(
            url,
          );
        },
        [
          revokeCoverObjectURL,
        ],
      );

    useEffect(() => {
      mountedRef.current =
        true;

      return () => {
        mountedRef.current =
          false;

        revokeProfileObjectURL();
        revokeCoverObjectURL();
      };
    }, [
      revokeCoverObjectURL,
      revokeProfileObjectURL,
    ]);

    useEffect(() => {
      const controller =
        new AbortController();

      setIsLoading(true);
      setError(null);

      void getEditableProfile(
        controller.signal,
      )
        .then(
          (
            loadedProfile,
          ) => {
            if (
              controller.signal
                .aborted ||
              !mountedRef.current
            ) {
              return;
            }

            const cleanBio =
              normalizeProfileBio(
                loadedProfile.bio,
              );

            setProfile(
              loadedProfile,
            );

            setBio(
              loadedProfile.bio,
            );

            setOriginalBio(
              cleanBio,
            );

            setProfileImageFile(
              null,
            );

            setCoverImageFile(
              null,
            );

            setServerProfilePreview(
              loadedProfile
                .profile_image_url,
            );

            setServerCoverPreview(
              loadedProfile
                .cover_image_url,
            );
          },
        )
        .catch(
          (
            loadError:
              unknown,
          ) => {
            if (
              controller.signal
                .aborted ||
              isProfileEditCancelled(
                loadError,
              ) ||
              !mountedRef.current
            ) {
              return;
            }

            setError(
              getProfileEditErrorMessage(
                loadError,
              ),
            );
          },
        )
        .finally(() => {
          if (
            !controller.signal
              .aborted &&
            mountedRef.current
          ) {
            setIsLoading(
              false,
            );
          }
        });

      return () => {
        controller.abort();
      };
    }, [
      reloadVersion,
      setServerCoverPreview,
      setServerProfilePreview,
    ]);

    const normalizedBio =
      useMemo(
        () =>
          normalizeProfileBio(
            bio,
          ),
        [bio],
      );

    const characterCount =
      useMemo(
        () =>
          countProfileBioCharacters(
            bio,
          ),
        [bio],
      );

    const remainingCharacters =
      Math.max(
        0,
        MAX_PROFILE_BIO_LENGTH -
          characterCount,
      );

    const hasBioChanged =
      profile !== null &&
      normalizedBio !==
        originalBio;

    const isDirty =
      hasBioChanged ||
      profileImageFile !==
        null ||
      coverImageFile !==
        null;

    const canSave =
      profile !== null &&
      !isLoading &&
      !isSaving &&
      isDirty &&
      characterCount <=
        MAX_PROFILE_BIO_LENGTH;

    const changeBio =
      useCallback(
        (value: string) => {
          if (isSaving) {
            return;
          }

          const characters =
            Array.from(value);

          const limitedValue =
            characters.length >
            MAX_PROFILE_BIO_LENGTH
              ? characters
                  .slice(
                    0,
                    MAX_PROFILE_BIO_LENGTH,
                  )
                  .join("")
              : value;

          setBio(
            limitedValue,
          );

          setError(null);
        },
        [isSaving],
      );

    const selectProfileImage =
      useCallback(
        (
          file: File | null,
        ) => {
          if (
            !file ||
            isSaving
          ) {
            return;
          }

          if (
            !isImageFile(file)
          ) {
            setError(
              "Please select a valid profile image",
            );
            return;
          }

          revokeProfileObjectURL();

          const objectURL =
            URL.createObjectURL(
              file,
            );

          profileObjectURLRef.current =
            objectURL;

          setProfileImageFile(
            file,
          );

          setProfilePreviewURL(
            objectURL,
          );

          setError(null);
        },
        [
          isSaving,
          revokeProfileObjectURL,
        ],
      );

    const selectCoverImage =
      useCallback(
        (
          file: File | null,
        ) => {
          if (
            !file ||
            isSaving
          ) {
            return;
          }

          if (
            !isImageFile(file)
          ) {
            setError(
              "Please select a valid cover image",
            );
            return;
          }

          revokeCoverObjectURL();

          const objectURL =
            URL.createObjectURL(
              file,
            );

          coverObjectURLRef.current =
            objectURL;

          setCoverImageFile(
            file,
          );

          setCoverPreviewURL(
            objectURL,
          );

          setError(null);
        },
        [
          isSaving,
          revokeCoverObjectURL,
        ],
      );

    const acceptUploadedProfileImage =
      useCallback(
        (url: string) => {
          revokeProfileObjectURL();

          setProfileImageFile(
            null,
          );

          setProfilePreviewURL(
            url,
          );
        },
        [
          revokeProfileObjectURL,
        ],
      );

    const acceptUploadedCoverImage =
      useCallback(
        (url: string) => {
          revokeCoverObjectURL();

          setCoverImageFile(
            null,
          );

          setCoverPreviewURL(
            url,
          );
        },
        [
          revokeCoverObjectURL,
        ],
      );

    const goBack =
      useCallback(
        () => {
          const locationState =
            location.state as
              | EditProfileLocationState
              | null;

          const returnTo =
            locationState?.returnTo
              ?.trim();

          if (
            returnTo &&
            returnTo.startsWith(
              "/",
            ) &&
            !returnTo.startsWith(
              "//",
            )
          ) {
            navigate(-1);
            return;
          }

          navigate(
            "/profile",
            {
              replace: true,
            },
          );
        },
        [
          location.state,
          navigate,
        ],
      );

    const closeEditor =
      useCallback(() => {
        if (isSaving) {
          return;
        }

        if (
          isDirty &&
          !window.confirm(
            "Discard your unsaved changes?",
          )
        ) {
          return;
        }

        goBack();
      }, [
        goBack,
        isDirty,
        isSaving,
      ]);

    useEffect(() => {
      if (
        !isDirty ||
        isSaving
      ) {
        return;
      }

      const handleBeforeUnload =
        (
          event:
            BeforeUnloadEvent,
        ) => {
          event.preventDefault();

          event.returnValue =
            "";
        };

      window.addEventListener(
        "beforeunload",
        handleBeforeUnload,
      );

      return () => {
        window.removeEventListener(
          "beforeunload",
          handleBeforeUnload,
        );
      };
    }, [
      isDirty,
      isSaving,
    ]);

    const saveProfile =
      useCallback(async () => {
        if (
          !profile ||
          !canSave
        ) {
          return;
        }

        setIsSaving(true);
        setError(null);

        let latestProfile =
          profile;

        let savedSomething =
          false;

        try {
          if (
            hasBioChanged
          ) {
            const updatedProfile =
              await updateProfileBio(
                bio,
              );

            if (
              !mountedRef.current
            ) {
              return;
            }

            latestProfile = {
              ...latestProfile,
              ...updatedProfile,
            };

            setBio(
              updatedProfile.bio,
            );

            setOriginalBio(
              normalizeProfileBio(
                updatedProfile.bio,
              ),
            );

            savedSomething =
              true;
          }

          const uploadTasks:
            ImageUploadTask[] =
              [];

          if (
            profileImageFile
          ) {
            uploadTasks.push({
              kind: "profile",

              promise:
                uploadProfileImage(
                  profileImageFile,
                ),
            });
          }

          if (
            coverImageFile
          ) {
            uploadTasks.push({
              kind: "cover",

              promise:
                uploadCoverImage(
                  coverImageFile,
                ),
            });
          }

          const uploadResults =
            await Promise.allSettled(
              uploadTasks.map(
                (
                  task,
                ) =>
                  task.promise,
              ),
            );

          if (
            !mountedRef.current
          ) {
            return;
          }

          const uploadErrors:
            string[] = [];

          uploadResults.forEach(
            (
              result,
              index,
            ) => {
              const task =
                uploadTasks[
                  index
                ];

              if (!task) {
                return;
              }

              const label =
                getUploadLabel(
                  task.kind,
                );

              if (
                result.status ===
                "rejected"
              ) {
                uploadErrors.push(
                  `${label}: ${getProfileEditErrorMessage(
                    result.reason,
                  )}`,
                );
                return;
              }

              const imageURL =
                getUploadedImageURL(
                  task.kind,
                  result.value,
                );

              if (!imageURL) {
                uploadErrors.push(
                  `${label}: upload returned no image`,
                );
                return;
              }

              savedSomething =
                true;

              if (
                task.kind ===
                "profile"
              ) {
                latestProfile = {
                  ...latestProfile,

                  profile_image_url:
                    imageURL,
                };

                acceptUploadedProfileImage(
                  imageURL,
                );

                return;
              }

              latestProfile = {
                ...latestProfile,

                cover_image_url:
                  imageURL,
              };

              acceptUploadedCoverImage(
                imageURL,
              );
            },
          );

          setProfile(
            latestProfile,
          );

          if (
            savedSomething
          ) {
            publishProfileUpdate({
              id:
                latestProfile.id,

              first_name:
                latestProfile.first_name,

              last_name:
                latestProfile.last_name,

              bio:
                latestProfile.bio,

              profile_image_url:
                latestProfile
                  .profile_image_url,

              cover_image_url:
                latestProfile
                  .cover_image_url,
            });
          }

          if (
            uploadErrors.length >
            0
          ) {
            const prefix =
              savedSomething
                ? "Some changes were saved. "
                : "";

            setError(
              `${prefix}${uploadErrors.join(
                " ",
              )}`,
            );

            return;
          }

          goBack();
        } catch (
          saveError
        ) {
          if (
            !mountedRef.current ||
            isProfileEditCancelled(
              saveError,
            )
          ) {
            return;
          }

          setError(
            getProfileEditErrorMessage(
              saveError,
            ),
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setIsSaving(
              false,
            );
          }
        }
      }, [
        acceptUploadedCoverImage,
        acceptUploadedProfileImage,
        bio,
        canSave,
        coverImageFile,
        goBack,
        hasBioChanged,
        profile,
        profileImageFile,
      ]);

    const reloadProfile =
      useCallback(() => {
        if (isSaving) {
          return;
        }

        setReloadVersion(
          (
            currentVersion,
          ) =>
            currentVersion + 1,
        );
      }, [isSaving]);

    return {
      profile,

      bio,

      profilePreviewURL,
      coverPreviewURL,

      characterCount,
      remainingCharacters,
      maxBioLength:
        MAX_PROFILE_BIO_LENGTH,

      isLoading,
      isSaving,
      isDirty,
      canSave,

      error,

      changeBio,

      selectProfileImage,
      selectCoverImage,

      saveProfile,

      closeEditor,
      reloadProfile,
    };
  };

export default useEditProfile;