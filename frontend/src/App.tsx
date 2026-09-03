import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import CreateMediaPost from "./components/Post/CreateMediaPost";
import CreateTextPost from "./components/textpost/CreateTextPost";
import { ProfileViewPage } from "./profileView";
import ProtectedRoute from "./routes/ProtectedRoute";
import { AboutPage } from "./pages/About";
import AI from "./pages/AI/AI";
import { CommunityGuidelinesPage } from "./pages/CommunityGuidelines";
import EditMediaPost from "./pages/editMediaPost/EditMediaPost";
import {
  PostEditProvider,
} from "./pages/editMediaPost/PostEditContext";
import EditTextPost from "./pages/editTextPost/EditTextPost";
import FollowPage from "./pages/Follow/FollowPage";
import Home from "./pages/Home/Home";
import ForgotPassword from "./pages/Login/ForgotPassword";
import Login from "./pages/Login/Login";
import ResetPassword from "./pages/Login/ResetPassword";
import VerificationCode from "./pages/Login/VerificationCode";
import { MobileAppPage } from "./pages/MobileApp";
import { MyActivityPage } from "./pages/MyActivity";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicy";
import Profile from "./pages/Profile/Profile";
import { ProfileConnectionsPage } from "./pages/ProfileConnections";
import Reels from "./pages/Reels/Reels";
import { SavedItemsPage } from "./pages/SavedItems";
import SearchPage from "./pages/Search/Search";
import { SettingsPage } from "./pages/Settings";
import Signup from "./pages/Signup/Signup";
import SignupSuccess from "./pages/Signup/SignupSuccess";

function App() {
  return (
    <BrowserRouter>
      <PostEditProvider>
        <Routes>
          <Route
            path="/signup"
            element={<Signup />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/forgot-password"
            element={<ForgotPassword />}
          />

          <Route
            path="/verification-code"
            element={<VerificationCode />}
          />

          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          <Route
            path="/privacy-policy"
            element={<PrivacyPolicyPage />}
          />

          <Route
            path="/about"
            element={<AboutPage />}
          />

          <Route element={<ProtectedRoute />}>
            <Route
              path="/"
              element={<Home />}
            />

            <Route
              path="/reels"
              element={<Reels />}
            />

            <Route
              path="/reels/:reelID"
              element={<Reels />}
            />

            <Route
              path="/search"
              element={<SearchPage />}
            />

            <Route
              path="/ai"
              element={<AI />}
            />

            <Route
              path="/signup-success"
              element={<SignupSuccess />}
            />

            <Route
              path="/profile"
              element={<Profile />}
            />

            <Route
              path="/profile/:userID"
              element={<ProfileViewPage />}
            />

            <Route
              path="/profile-connections/:userID/:tab"
              element={<ProfileConnectionsPage />}
            />

            <Route
              path="/follow"
              element={<FollowPage />}
            />

            <Route
              path="/create/media"
              element={<CreateMediaPost />}
            />

            <Route
              path="/create/text"
              element={<CreateTextPost />}
            />

            <Route
              path="/posts/:postId/edit"
              element={<EditMediaPost />}
            />

            <Route
              path="/text-posts/:postId/edit"
              element={<EditTextPost />}
            />

            <Route
              path="/community-guidelines"
              element={<CommunityGuidelinesPage />}
            />

            <Route
              path="/mobile-app"
              element={<MobileAppPage />}
            />

            <Route
              path="/my-activity"
              element={<MyActivityPage />}
            />

            <Route
              path="/saved-items"
              element={<SavedItemsPage />}
            />

            <Route
              path="/settings"
              element={<SettingsPage />}
            />
          </Route>
        </Routes>
      </PostEditProvider>
    </BrowserRouter>
  );
}

export default App;