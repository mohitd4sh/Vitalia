import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, Mail, Send } from "lucide-react";
import { requestPasswordChange } from "../../services/api.js";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState("email");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasAdminRequest, setHasAdminRequest] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    setHasAdminRequest(false);
    try {
      const result = await requestPasswordChange({ email, method });
      if (method === "admin" && result.recoveryToken) {
        sessionStorage.setItem("vitalia:password-change-token", result.recoveryToken);
        setHasAdminRequest(true);
      } else if (method === "admin") {
        sessionStorage.removeItem("vitalia:password-change-token");
        setMessage("If the account exists, the request could not be started. Check the email address or try again later.");
      }
      setMessage(method === "email"
        ? "If an account exists for that email, a password reset link will be sent."
        : "If an account exists for that email, a password change request has been sent to an administrator.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="recovery-page">
      <Link to="/login" className="brand">
        <span className="brand-icon"><Activity size={23} /></span>
        VITALIA<span className="brand-dot">.</span>
      </Link>

      <section className="recovery-card">
        <div className="recovery-icon"><Send size={25} /></div>

        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h2>Forgot your password?</h2>
        <p>
          Choose how you want to recover your account.
        </p>

        <div className="recovery-methods" role="group" aria-label="Password recovery method">
          <button type="button" className={method === "email" ? "primary-button" : "secondary-action"} aria-pressed={method === "email"} onClick={() => setMethod("email")}>Email reset link</button>
          <button type="button" className={method === "admin" ? "primary-button" : "secondary-action"} aria-pressed={method === "admin"} onClick={() => setMethod("admin")}>Ask an admin</button>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="recovery-email">Email address</label>
          <div className="input-wrap">
            <Mail size={18} />
            <input
              id="recovery-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <div className="success-message" role="status">{message}</div>}
          {message && method === "admin" && hasAdminRequest && (
            <Link to="/reset-password" className="back-link">Open password change page</Link>
          )}
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Submitting…" : method === "email" ? "Send reset link" : "Request admin approval"} <Send size={17} />
          </button>
        </form>

        <Link to="/login" className="back-link">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </section>
    </div>
  );
}

export default ForgotPassword;