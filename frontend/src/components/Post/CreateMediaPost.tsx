import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ImagePlus, User, X } from "lucide-react";
import { createMediaPost, type FeedPost } from "../../services/postService";
import { getCurrentUser } from "../../services/userService";
import { VerifiedName } from "../VerifiedBadge";
import "./CreateMediaPost.css";

type SelectedMedia = {
  file: File;
  url: string;
  type: "image" | "video";
};

type CurrentUser = {
  id?: string;
  first_name: string;
  last_name: string;
  profile_image_url?: string;
};

type CreateMediaLocationState = {
  files?: File[];
};

const MAX_IMAGES = 10;

const CreateMediaPost = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const addMoreInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);
  const mediaListRef = useRef<SelectedMedia[]>([]);

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [caption, setCaption] = useState("");
  const [mediaList, setMediaList] = useState<SelectedMedia[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [posting, setPosting] = useState(false);

  const routeState = location.state as CreateMediaLocationState | null;
  const initialFiles = routeState?.files;

  const activeMedia = mediaList[activeIndex];
  const mediaType = mediaList[0]?.type;
  const canAddMore = mediaType === "image" && mediaList.length < MAX_IMAGES;

  const fullName = useMemo(() => {
    return `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  }, [user]);

  const revokeMediaUrls = useCallback((items: SelectedMedia[]) => {
    items.forEach((item) => {
      URL.revokeObjectURL(item.url);
    });
  }, []);

  const createMediaItems = useCallback((files: File[]): SelectedMedia[] => {
    const validFiles = files.filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (validFiles.length === 0) return [];

    const firstFile = validFiles[0];

    if (firstFile.type.startsWith("video/")) {
      return [
        {
          file: firstFile,
          url: URL.createObjectURL(firstFile),
          type: "video",
        },
      ];
    }

    return validFiles
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_IMAGES)
      .map((file) => ({
        file,
        url: URL.createObjectURL(file),
        type: "image" as const,
      }));
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setUser({
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          profile_image_url: data.profile_image_url,
        });
      })
      .catch((error) => {
        console.error("User load failed:", error);
      });
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;

    initializedRef.current = true;

    if (!initialFiles || initialFiles.length === 0) {
      navigate("/", { replace: true });
      return;
    }

    const selectedMedia = createMediaItems(initialFiles);

    if (selectedMedia.length === 0) {
      navigate("/", { replace: true });
      return;
    }

    mediaListRef.current = selectedMedia;
    setMediaList(selectedMedia);
    setActiveIndex(0);
  }, [createMediaItems, initialFiles, navigate]);

  useEffect(() => {
    mediaListRef.current = mediaList;
  }, [mediaList]);

  useEffect(() => {
    return () => {
      revokeMediaUrls(mediaListRef.current);
    };
  }, [revokeMediaUrls]);

  const closePage = useCallback(() => {
    revokeMediaUrls(mediaListRef.current);
    mediaListRef.current = [];
    navigate(-1);
  }, [navigate, revokeMediaUrls]);

  const handleAddMore = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";

      if (mediaType !== "image") return;

      const remainingSlots = MAX_IMAGES - mediaList.length;

      if (remainingSlots <= 0) {
        alert(`Maximum ${MAX_IMAGES} images allowed.`);
        return;
      }

      const selectedImages = files
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, remainingSlots)
        .map((file) => ({
          file,
          url: URL.createObjectURL(file),
          type: "image" as const,
        }));

      if (selectedImages.length === 0) return;

      setMediaList((previous) => {
        const updated = [...previous, ...selectedImages];
        mediaListRef.current = updated;
        setActiveIndex(updated.length - selectedImages.length);
        return updated;
      });

      if (files.length > remainingSlots) {
        alert(`Maximum ${MAX_IMAGES} images allowed.`);
      }
    },
    [mediaList.length, mediaType]
  );

  const removeActiveMedia = useCallback(() => {
    setMediaList((previous) => {
      const currentMedia = previous[activeIndex];

      if (!currentMedia) return previous;

      URL.revokeObjectURL(currentMedia.url);

      const updated = previous.filter((_, index) => index !== activeIndex);
      mediaListRef.current = updated;

      if (updated.length === 0) {
        navigate(-1);
        return [];
      }

      setActiveIndex((current) =>
        Math.max(0, Math.min(current, updated.length - 1))
      );

      return updated;
    });
  }, [activeIndex, navigate]);

  const handlePostCreated = useCallback(
    (createdPost: FeedPost) => {
      window.dispatchEvent(
        new CustomEvent("everest:new-post", {
          detail: createdPost,
        })
      );

      revokeMediaUrls(mediaListRef.current);
      mediaListRef.current = [];

      navigate("/", {
        replace: true,
        state: {
          instantPost: createdPost,
        },
      });
    },
    [navigate, revokeMediaUrls]
  );

  const handlePost = useCallback(async () => {
    if (posting || mediaList.length === 0) return;

    try {
      setPosting(true);

      const createdPost = await createMediaPost(
        caption,
        mediaList.map((item) => item.file)
      );

      handlePostCreated(createdPost);
    } catch (error) {
      console.error("Create media post failed:", error);
      alert("Post create failed. Please try again.");
    } finally {
      setPosting(false);
    }
  }, [caption, handlePostCreated, mediaList, posting]);

  if (mediaList.length === 0) {
    return null;
  }

  return (
    <main className="createMediaPage">
      <input
        ref={addMoreInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleAddMore}
      />

      <header className="createMediaHeader">
        <button
          type="button"
          className="createMediaClose"
          onClick={closePage}
          disabled={posting}
        >
          <X size={24} />
        </button>

        <h1>Create post</h1>

        <button
          type="button"
          className="createMediaPostBtn"
          onClick={handlePost}
          disabled={posting || mediaList.length === 0}
        >
          {posting ? "posting..." : "post"}
        </button>
      </header>

      <section className="createMediaUser">
        <div className="createMediaAvatar">
          {user?.profile_image_url ? (
            <img src={user.profile_image_url} alt={fullName || "Everest User"} />
          ) : (
            <User
              size={24}
               strokeWidth={3.5}
              aria-hidden="true"
             />
          )}
        </div>

        <VerifiedName
          as="strong"
           userID={user?.id ?? ""}
           name={fullName}
           fallback="Mongosky User"
           badgeSize="sm"
            />
      </section>

      <textarea
        className="createMediaCaption"
        placeholder="write a caption..."
        value={caption}
        disabled={posting}
        onChange={(event) => setCaption(event.target.value)}
      />

      <section className="createMediaPreview">
        {mediaType === "image" && mediaList.length > 1 ? (
          <div className="createMediaCounter">
            {activeIndex + 1}/{mediaList.length}
          </div>
        ) : null}

        <button
          type="button"
          className="createMediaRemove"
          onClick={removeActiveMedia}
          disabled={posting}
        >
          <X size={22} />
        </button>

        {activeMedia?.type === "image" ? (
          <img src={activeMedia.url} alt="Selected media" />
        ) : (
          <video src={activeMedia.url} controls playsInline />
        )}
      </section>

      {mediaType === "image" && mediaList.length > 1 ? (
        <section className="createMediaThumbnails" aria-label="Selected images">
          {mediaList.map((item, index) => (
            <button
              key={`${item.file.name}-${item.file.lastModified}-${index}`}
              type="button"
              className={`createMediaThumb ${
                index === activeIndex ? "active" : ""
              }`}
              onClick={() => setActiveIndex(index)}
              disabled={posting}
            >
              <img src={item.url} alt={`Selected ${index + 1}`} />
            </button>
          ))}
        </section>
      ) : null}

      {canAddMore ? (
        <button
          type="button"
          className="createMediaAddMore"
          onClick={() => addMoreInputRef.current?.click()}
          disabled={posting}
        >
          <span>
            <ImagePlus size={22} />
          </span>

          <strong>Add more</strong>

          <small>
            {mediaList.length}/{MAX_IMAGES} selected
          </small>
        </button>
      ) : null}
    </main>
  );
};

export default memo(CreateMediaPost);