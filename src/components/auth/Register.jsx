import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Mail, LockKeyhole, UserRound } from "lucide-react";
import { registerUser } from "../../services/api.js";

function Register({ onRegister }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (form.password.length < 8 || form.password.length > 72) {
      setError("Use a password with 8 to 72 characters.");
      return;
    }

    try {
      setLoading(true);
      const user = await registerUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      onRegister(user);
      navigate(user.profileCompleted ? "/dashboard" : "/setup", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <Link to="/about" className="brand">
          <span className="brand-icon"><Activity size={23} /></span>
          VITALIA<span className="brand-dot">.</span>
        </Link>

        <div className="visual-content">
          <span className="eyebrow">A BETTER WAY TO TAKE CARE</span>
          <h1>
            Make room
            <br />
            for wellbeing.
          </h1>
          <p>
            One place for your diagnostic bookings, appointments,
            and reports.
          </p>
          <div className="visual-orbit">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-center"><Activity size={48} /></div>
          </div>
        </div>

        <div className="visual-footer">
          <Activity size={17} />
          A clearer view of your health starts here.
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand brand">
            <span className="brand-icon"><Activity size={22} /></span>
            VITALIA<span className="brand-dot">.</span>
          </div>

          <div className="form-heading">
            <span className="eyebrow">GET STARTED</span>
            <h2>Create your account.</h2>
            <p>Your personal health space is a few steps away.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="name">Full name</label>
            <div className="input-wrap">
              <UserRound size={18} />
              <input
                id="name"
                name="name"
                placeholder="Your full name"
                value={form.name}
                onChange={updateField}
                autoComplete="name"
                required
              />
            </div>

            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <Mail size={18} />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={updateField}
                autoComplete="email"
                required
              />
            </div>

            <label htmlFor="password">Create password</label>
            <div className="input-wrap">
              <LockKeyhole size={18} />
              <input
                id="password"
                name="password"
                type="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={updateField}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

export default Register;