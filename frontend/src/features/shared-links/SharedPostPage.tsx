import { useEffect, useReducer } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import Post from "../../components/Post/Post";
import type { FeedPost } from "../../services/postService";
import { readSharedPost, SharedLinkError } from "./sharedLinkApi";
import { sharedLinkAuthURL } from "./sharedLinkDestination";
import "./SharedLinks.css";

type State = { id: string; post: FeedPost | null; loading: boolean; error: string | null; signup: boolean };
const reducer = (_state: State, action: State): State => action;

export default function SharedPostPage() {
  const { postID = "" } = useParams();
  const location = useLocation();
  const [attempt, retry] = useReducer((count: number) => count + 1, 0);
  const [state, dispatch] = useReducer(reducer, { id: postID, post: null, loading: true, error: null, signup: false });
  useEffect(() => {
    const controller = new AbortController();
    const token = sessionStorage.getItem("token");
    dispatch({ id: postID, post: null, loading: true, error: null, signup: false });
    if (!token) { dispatch({ id: postID, post: null, loading: false, error: null, signup: true }); return () => controller.abort(); }
    void readSharedPost(postID, token, controller.signal).then((post) => {
      if (!controller.signal.aborted) dispatch({ id: postID, post, loading: false, error: null, signup: false });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const expired = error instanceof SharedLinkError && error.status === 401;
      if (expired && sessionStorage.getItem("token") === token) sessionStorage.removeItem("token");
      dispatch({ id: postID, post: null, loading: false, error: error instanceof Error ? error.message : "Could not load this post.", signup: expired });
    });
    return () => controller.abort();
  }, [postID, attempt]);

  if (state.id === postID && state.signup) return <Navigate to={sharedLinkAuthURL("/signup", location.pathname)} replace state={{ from: location.pathname }} />;
  return <main className="shared-post-page">
    <header className="shared-post-header"><Link className="shared-post-brand" to="/">Mongosky</Link><Link to="/">Home</Link></header>
    {state.loading || state.id !== postID ? <section className="shared-link-status" role="status"><span className="shared-link-spinner" /><p>Loading post…</p></section> :
      state.error ? <section className="shared-link-status" role="alert"><h1>Post unavailable</h1><p>{state.error}</p><button onClick={retry}>Try again</button></section> :
        state.post ? <Post key={state.post.id} post={state.post} showFollowAction /> : null}
  </main>;
}
