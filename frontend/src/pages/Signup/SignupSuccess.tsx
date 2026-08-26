import { useNavigate } from "react-router-dom";
import "./SignupSuccess.css";

const SignupSuccess = () => {
  const navigate = useNavigate();

  const goToHome = () => navigate("/", { replace: true });
  const goToLogin = () => navigate("/login", { replace: true });

  return (
    <div className="successPage">
      <div className="successCard">

        {/* ── Confetti particles inside card ── */}
        <div className="confettiWrap">
          <span className="cp cp-star cp1">★</span>
          <span className="cp cp-star cp2">★</span>
          <span className="cp cp-star cp3">★</span>
          <span className="cp cp-star cp4">★</span>
          <span className="cp cp-star cp5">✦</span>
          <span className="cp cp-star cp6">✦</span>

          <span className="cp cp-dot cp7" />
          <span className="cp cp-dot cp8" />
          <span className="cp cp-dot cp9" />
          <span className="cp cp-dot cp10" />
          <span className="cp cp-dot cp11" />
          <span className="cp cp-dot cp12" />
          <span className="cp cp-dot cp13" />

          <span className="cp cp-rib cp14">〜</span>
          <span className="cp cp-rib cp15">〜</span>
          <span className="cp cp-rib cp16">〜</span>
          <span className="cp cp-rib cp17">〜</span>

          <span className="cp cp-tri cp18">▲</span>
          <span className="cp cp-tri cp19">▲</span>
          <span className="cp cp-tri cp20">▲</span>

          <span className="cp cp-sq cp21">■</span>
          <span className="cp cp-sq cp22">■</span>
          <span className="cp cp-sq cp23">■</span>
        </div>

        {/* ── Hero icon ── */}
        <div className="successHero">
          <div className="successGlow" />
          <div className="successIcon">✓</div>
          <div className="successShadow" />

          <div className="heroParticles">
            <span>✦</span><span>★</span><span>●</span><span>✸</span>
            <span>◆</span><span>✦</span><span>★</span><span>●</span>
            <span>✿</span><span>✦</span><span>◆</span><span>★</span>
          </div>
        </div>

        <h1>Congratulations!</h1>
        <p className="successSubtitle">Your account signup successful</p>
        <p className="successText">
          Welcome to Mongosky! You are now part of our community. Let's explore and connect together.
        </p>

        <button className="successBtn" onClick={goToHome}>Go to Home</button>

        <p className="successLogin">
          Already have an account?{" "}
          <button type="button" onClick={goToLogin}>Sign In</button>
        </p>
      </div>
    </div>
  );
};

export default SignupSuccess;