import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, KeyRound } from "lucide-react";
import { completePasswordChange, fetchPasswordChangeStatus } from "../../services/api.js";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() =>
    searchParams.get("token") || sessionStorage.getItem("vitalia:password-change-token") || ""
  );
  const [requestStatus, setRequestStatus] = useState(token ? "checking" : "missing");
  const [requestMethod, setRequestMethod] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token || !["checking", "pending"].includes(requestStatus)) return undefined;
    let active = true;
    async function checkStatus() {
      try {
        const result = await fetchPasswordChangeStatus(token);
        if (active) {
          setRequestMethod(result.method);
          setRequestStatus(result.status);
          setError("");
        }
      } catch (requestError) {
        if (active) {
          setRequestStatus("invalid");
          setError(requestError.message);
        }
      }
    }
    checkStatus();
    const timer = requestStatus === "pending" ? window.setInterval(checkStatus, 10000) : null;
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [token, requestStatus]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await completePasswordChange({ token, password });
      setMessage(result.message);
      sessionStorage.removeItem("vitalia:password-change-token");
      setRequestStatus("completed");
      setPassword("");
      setConfirmPassword("");
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
        <div className="recovery-icon"><KeyRound size={25} /></div>
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h2>Choose a new password</h2>
        <p>{requestMethod === "admin"
          ? "This page checks your password change request in the browser where you submitted it."
          : "This one-time link expires 30 minutes after it was issued."}</p>
        {!token ? (
          <p className="form-error" role="alert">No password change request was found in this browser. Submit a new request from Forgot password.</p>
        ) : requestStatus === "checking" ? (
          <p role="status">Checking your password change request…</p>
        ) : requestStatus === "pending" ? (
          <p role="status">Your request is waiting for administrator approval. This page will update when it is approved.</p>
        ) : requestStatus === "invalid" ? (
          <p className="form-error" role="alert">{error || "This password change request is invalid or no longer available. Request a new one."}</p>
        ) : message ? (
          <div className="success-message" role="status">{message}</div>
        ) : requestStatus === "approved" ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" className="admin-input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" className="admin-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={72} required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Changing password…" : "Change password"}
            </button>
          </form>
        ) : requestStatus === "completed" ? <div className="success-message" role="status">{message}</div> : null}
        <Link to="/login" className="back-link"><ArrowLeft size={16} /> Back to sign in</Link>
      </section>
    </div>
  );
}

export default ResetPassword;
