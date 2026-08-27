import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import Home from "./pages/Home/Home";
import Signup from "./pages/Signup/Signup";
import Login from "./pages/Login/Login";
import SignupSuccess from "./pages/Signup/SignupSuccess";
import Profile from "./pages/Profile/Profile";
import ForgotPassword from "./pages/Login/ForgotPassword";
import VerificationCode from "./pages/Login/VerificationCode";
import ResetPassword from "./pages/Login/ResetPassword";
import AI from "./pages/AI/AI";
import Reels from "./pages/Reels/Reels";
import SearchPage from "./pages/Search/Search";
import CreateMediaPost from "./components/Post/CreateMediaPost";
import CreateTextPost from "./components/textpost/CreateTextPost";
import EditMediaPost from "./pages/editMediaPost/EditMediaPost";
import EditTextPost from "./pages/editTextPost/EditTextPost";
import { ProfileViewPage } from "./profileView";
import FollowPage from "./pages/Follow/FollowPage";

import {
  ProfileConnectionsPage,
} from "./pages/ProfileConnections";

import {
  PostEditProvider,
} from "./pages/editMediaPost/PostEditContext";

function App() {
  return (
    <BrowserRouter>
      <PostEditProvider>
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/reels"
            element={<Reels />}
          />


          <Route
            path="/search"
         element={<SearchPage />}
          />

          <Route
            path="/reels/:reelID"
            element={<Reels />}
          />

          <Route
            path="/signup"
            element={<Signup />}
          />

          <Route
            path="/login"
            element={<Login />}
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
            path="/profile/:userID"
            element={<ProfileViewPage />}
          />

          <Route
            path="/follow"
            element={<FollowPage />}
          />


          <Route
            path="/profile-connections/:userID/:tab"
            element={<ProfileConnectionsPage />}
          />

          <Route
            path="/text-posts/:postId/edit"
            element={<EditTextPost />}
          />
        </Routes>
      </PostEditProvider>
    </BrowserRouter>
  );
}

export default App;