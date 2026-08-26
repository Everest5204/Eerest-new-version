import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  User,
  History,
  Bookmark,
  UserPlus,
  Settings,
  ShieldCheck,
  Pencil,
  Smartphone,
  LogIn,
  X,
} from "lucide-react";

import { getCurrentUser } from "../../services/userService";
import "./LeftDrawer.css";

type LeftDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigateClose: () => void;
};

type DrawerUser = {
  id?: string;
  first_name: string;
  last_name: string;
  followers_count: number;
  following_count: number;
  profile_image_url?: string;
};

type DrawerItem = {
  icon: ComponentType<{
    size?: number;
    strokeWidth?: number;
  }>;
  label: string;
  path: string;
};

const drawerItems: DrawerItem[] = [
  {
    icon: User,
    label: "Profile",
    path: "/profile",
  },
  {
    icon: History,
    label: "My Activity",
    path: "",
  },
  {
    icon: Bookmark,
    label: "Saved Items",
    path: "",
  },
  {
    icon: UserPlus,
    label: "Signup",
    path: "/signup",
  },
  {
    icon: Settings,
    label: "Settings",
    path: "",
  },
  {
    icon: ShieldCheck,
    label: "Community Guidelines",
    path: "",
  },
  {
    icon: Pencil,
    label: "Change name",
    path: "",
  },
  {
    icon: Smartphone,
    label: "Mobile App",
    path: "",
  },
  {
    icon: LogIn,
    label: "Login",
    path: "/login",
  },
];

const normalizeDrawerUser = (data: Partial<DrawerUser>): DrawerUser => {
  return {
    id: data.id ?? "",
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    followers_count: Number(data.followers_count ?? 0),
    following_count: Number(data.following_count ?? 0),
    profile_image_url: data.profile_image_url ?? "",
  };
};

const LeftDrawer = ({
  isOpen,
  onClose,
  onNavigateClose,
}: LeftDrawerProps) => {
  const navigate = useNavigate();

  const [user, setUser] = useState<DrawerUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const fullName = useMemo(() => {
    const name = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();

    if (isAuthenticated && name) {
      return name;
    }

    return "Welcome to Mongosky";
  }, [isAuthenticated, user]);

  const profileImageURL = user?.profile_image_url?.trim() || "";
  const firstLetter =
    isAuthenticated && fullName !== "Welcome to Mongosky"
      ? fullName.charAt(0).toUpperCase()
      : "M";

  const loadDrawerUser = useCallback(async () => {
    try {
      setUserLoading(true);

      const data = await getCurrentUser();
      const normalizedUser = normalizeDrawerUser(data);

      setUser(normalizedUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Drawer user load failed:", error);

      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    loadDrawerUser();
  }, [isOpen, loadDrawerUser]);

  const handleItemClick = useCallback(
    (path: string) => {
      if (!path) return;

      if (path === "/profile" && !isAuthenticated) {
        navigate("/login");
        onNavigateClose();
        return;
      }

      navigate(path);
      onNavigateClose();
    },
    [isAuthenticated, navigate, onNavigateClose]
  );

  const handleProfileClick = useCallback(() => {
    if (isAuthenticated) {
      handleItemClick("/profile");
      return;
    }

    handleItemClick("/login");
  }, [handleItemClick, isAuthenticated]);

  return (
    <>
      <div
        className={`drawerOverlay ${isOpen ? "drawerOverlayShow" : ""}`}
        onClick={onClose}
      />

      <aside className={`leftDrawer ${isOpen ? "leftDrawerOpen" : ""}`}>
        <div className="drawerTop">
          <button
            type="button"
            className="drawerProfile"
            onClick={handleProfileClick}
          >
            <div className="drawerAvatar">
              {profileImageURL ? (
                <img src={profileImageURL} alt={fullName} />
              ) : userLoading ? (
                <span className="drawerAvatarSkeleton" />
              ) : (
                <span className="drawerAvatarFallback">{firstLetter}</span>
              )}
            </div>

            <div className="drawerUser">
              {userLoading ? (
                <>
                  <span className="drawerNameSkeleton" />
                  <span className="drawerCountSkeleton" />
                </>
              ) : (
                <>
                  <h2>{fullName}</h2>

                  <p>
                    {isAuthenticated
                      ? `${user?.following_count ?? 0} Following • ${
                          user?.followers_count ?? 0
                        } Followers`
                      : "Login or signup to continue"}
                  </p>
                </>
              )}
            </div>
          </button>

          <button className="drawerClose" type="button" onClick={onClose}>
            <X size={30} strokeWidth={2.2} />
          </button>
        </div>

        <div className="drawerMenu">
          {drawerItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                className="drawerItem"
                key={item.label}
                type="button"
                onClick={() => handleItemClick(item.path)}
              >
                <span className="drawerIcon">
                  <Icon size={24} strokeWidth={2.2} />
                </span>

                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default memo(LeftDrawer);