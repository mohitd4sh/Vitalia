import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { loginUser } from "../../services/api.js";
import { getRoleHomePath } from "../../services/permissions.js";

function Login({ onLogin }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const user = await loginUser({
        email: email.trim(),
        password,
      });

      onLogin(user);

      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (user.role === "staff") {
        navigate("/staff/bookings", { replace: true });
      } else if (user.role === "custom") {
        navigate(getRoleHomePath(user), { replace: true });
      } else if (user.profileCompleted) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/setup", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <Link to="/about" className="brand">
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          VITALIA<span className="brand-dot">.</span>
        </Link>

        <div className="visual-content">
          <span className="eyebrow">YOUR HEALTH, IN FOCUS</span>
          <h1>
            Clarity for
            <br />
            your health.
          </h1>
          <p>
            Discover trusted diagnostics, book tests with ease,
            and keep your health journey in one place.
          </p>

          <div className="visual-orbit">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-center">
              <Activity size={48} strokeWidth={1.3} />
            </div>
            <span className="orbit-tag tag-top">Care, simplified</span>
            <span className="orbit-tag tag-bottom">Your health space</span>
          </div>
        </div>

        <div className="visual-footer">
          <ShieldCheck size={17} />
          Your health journey, thoughtfully connected.
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand brand">
            <span className="brand-icon">
              <Activity size={22} />
            </span>
            VITALIA<span className="brand-dot">.</span>
          </div>

          <div className="form-heading">
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Good to see you.</h2>
            <p>Sign in to continue your health journey.</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="password-label">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password">Forgot password?</Link>
            </div>

            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="auth-switch">
            New to Vitalia? <Link to="/register">Create an account</Link>
          </p>

          <div className="auth-note">
            <ShieldCheck size={17} />
            <span>Your personal health information deserves care.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Login;