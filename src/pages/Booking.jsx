import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, MapPin, Printer, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import BillingPreview from "../components/billing/BillingPreview.jsx";
import {
  cancelBooking,
  chooseBookingPaymentMethod,
  fetchPaymentInfo,
  fetchBookings,
  fetchUserReports,
} from "../services/api.js";
import { hasPermission } from "../services/permissions.js";

function Bookings({ user }) {
  const canUpdateBookings = user?.role !== "custom" || hasPermission(user, "bookings", "update");
  const canCancelBookings = user?.role !== "custom" || hasPermission(user, "bookings", "delete");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [paymentInfoByCenter, setPaymentInfoByCenter] = useState({});
  const paymentInfoCache = useRef({});
  const [reportBookingIds, setReportBookingIds] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [cancelCandidate, setCancelCandidate] = useState(null);
  const [cancelError, setCancelError] = useState("");

  const loadCenterPaymentInfo = useCallback(async (nextBookings) => {
    const centerIds = [...new Set(nextBookings
      .map((booking) => booking.center?._id || booking.center)
      .filter(Boolean)
      .map(String))];
    const missingIds = centerIds.filter((centerId) => !paymentInfoCache.current[centerId]);
    const entries = await Promise.all(missingIds.map(async (centerId) =>
      [centerId, await fetchPaymentInfo(centerId)]
    ));
    paymentInfoCache.current = { ...paymentInfoCache.current, ...Object.fromEntries(entries) };
    return paymentInfoCache.current;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextBookings, reports] = await Promise.all([
        fetchBookings({ mine: true }),
        fetchUserReports(),
      ]);
      setPaymentInfoByCenter(await loadCenterPaymentInfo(nextBookings));
      setBookings(nextBookings);
      setReportBookingIds(reports.map((report) => report.bookingId).filter(Boolean));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadCenterPaymentInfo]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function syncBookings(initialLoad = false) {
      if (inFlight) return;
      inFlight = true;
      try {
        const [results, reports] = await Promise.all([
          fetchBookings({ mine: true }),
          fetchUserReports(),
        ]);
        if (active) {
          setBookings(results);
          setPaymentInfoByCenter(await loadCenterPaymentInfo(results));
          setReportBookingIds(reports.map((report) => report.bookingId).filter(Boolean));
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        inFlight = false;
        if (active && initialLoad) setLoading(false);
      }
    }
    function syncWhenVisible() {
      if (document.visibilityState === "visible") syncBookings();
    }
    syncBookings(true);
    const timer = window.setInterval(syncWhenVisible, 5000);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [loadCenterPaymentInfo]);

  useEffect(() => {
    if (!cancelCandidate) return undefined;
    function handleDialogKeyDown(event) {
      if (event.key === "Escape" && workingId !== cancelCandidate.id) {
        setCancelCandidate(null);
        setCancelError("");
      }
    }
    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [cancelCandidate, workingId]);

  async function choosePayment(booking, method) {
    setWorkingId(booking.id);
    setError("");
    setSuccess("");
    try {
      await chooseBookingPaymentMethod(booking.id, method);
      setSuccess(method === "upi"
        ? "UPI payment selected. Pay using the UPI link, then the center will confirm receipt."
        : "Cash selected. Pay at the diagnostic center; staff will confirm receipt.");
      await refresh();
    } catch (paymentError) {
      setError(paymentError.message);
    } finally {
      setWorkingId("");
    }
  }

  async function handleCancel(booking) {
    setWorkingId(booking.id);
    setCancelError("");
    setError("");
    try {
      await cancelBooking(booking.id);
      setSuccess("Booking cancelled.");
      setCancelCandidate(null);
      await refresh();
    } catch (requestError) {
      setCancelError(requestError.message);
    } finally {
      setWorkingId("");
    }
  }

  return (
    <div className="content-page">
      <span className="eyebrow">APPOINTMENTS</span>
      <div className="admin-page-header">
        <div>
          <h1>My bookings.</h1>
          <p className="page-intro">Review appointment status, manage payment, and print a bill copy to keep for reference.</p>
        </div>
        <button className="secondary-action" onClick={refresh}><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {success && <p className="report-message report-success" role="status">{success}</p>}

      {loading ? <div className="empty-state">Loading your bookings…</div> : bookings.length ? (
        <div className="booking-list">
          {bookings.map((booking) => {
            const centerId = String(booking.center?._id || booking.center || "");
            const paymentInfo = paymentInfoByCenter[centerId] || { upiId: "", businessName: "Vitalia Diagnostics" };
            return (
              <article className="booking-card" key={booking.id}>
              <div className="booking-icon"><CalendarDays size={23} /></div>
              <div className="booking-main">
                <span className="booking-id">VTL-{booking.id.slice(-8).toUpperCase()}</span>
                <h3>{booking.testName}</h3>
                <p><MapPin size={15} /> {booking.centerName} · {booking.collectionType === "home" ? "Home collection" : "Center visit"}</p>
                <p><CalendarDays size={15} /> {new Date(booking.appointmentAt).toLocaleDateString()}</p>
                <p><Clock3 size={15} /> {new Date(booking.appointmentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                <p className="booking-price">{booking.discountAmount > 0 ? <><s>₹{booking.originalPrice}</s> ₹{booking.price} · {booking.couponCode} applied · </> : `₹${booking.price} · `}Payment: {booking.payment?.status || "unpaid"}</p>
              </div>
              <div className="booking-controls">
                <span className={`status-pill status-${booking.status}`}>{booking.status.replaceAll("_", " ")}</span>
                {booking.status !== "cancelled" && (
                  <button className="secondary-action" onClick={() => setSelectedBill(booking)}>
                    <Printer size={15} /> Print bill / keep copy
                  </button>
                )}
                {booking.status === "completed" && reportBookingIds.includes(booking.id) && (
                  <p className="booking-report-ready">
                    Your PDF is ready. <Link to="/reports">Check Medical Reports to download it.</Link>
                  </p>
                )}
                {canUpdateBookings && booking.payment?.status !== "paid" && booking.status !== "cancelled" && booking.payment?.status !== "pending" && (
                  <>
                    <button className="primary-button" onClick={() => choosePayment(booking, "upi")} disabled={workingId === booking.id || !paymentInfo.upiId}>
                      {workingId === booking.id ? "Please wait…" : "Pay by UPI"}
                    </button>
                    {!paymentInfo.upiId && <span className="admin-help">UPI is not set up; cash is available.</span>}
                    <button className="secondary-action" onClick={() => choosePayment(booking, "cash")} disabled={workingId === booking.id}>Pay cash at center</button>
                  </>
                )}
                {booking.payment?.status === "pending" && booking.payment.method === "upi" && paymentInfo.upiId && (
                  <div className="booking-payment-note">
                    <span>Pay {paymentInfo.businessName}</span>
                    <strong>{paymentInfo.upiId}</strong>
                    <QRCodeSVG
                      className="booking-payment-qr"
                      value={`upi://pay?pa=${encodeURIComponent(paymentInfo.upiId)}&pn=${encodeURIComponent(paymentInfo.businessName)}&am=${encodeURIComponent(Number(booking.price).toFixed(2))}&cu=INR&tn=${encodeURIComponent(`Booking ${booking.id.slice(-8)}`)}`}
                      size={184}
                      level="M"
                      includeMargin
                      title={`UPI payment QR for ${booking.testName}`}
                    />
                    <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(booking.price)}</span>
                    <a className="primary-button" href={`upi://pay?pa=${encodeURIComponent(paymentInfo.upiId)}&pn=${encodeURIComponent(paymentInfo.businessName)}&am=${encodeURIComponent(Number(booking.price).toFixed(2))}&cu=INR&tn=${encodeURIComponent(`Booking ${booking.id.slice(-8)}`)}`} target="_blank" rel="noreferrer">Open UPI app</a>
                    <small>Payment stays pending until the center confirms receipt.</small>
                  </div>
                )}
                {booking.payment?.status === "pending" && booking.payment.method === "cash"}
                {canCancelBookings && booking.status === "pending" && booking.payment?.status !== "paid" && (
                  <button className="secondary-action" onClick={() => { setCancelCandidate(booking); setCancelError(""); }} disabled={workingId === booking.id}>Cancel</button>
                )}
              </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="reports-empty">
          <div className="reports-empty-icon"><CalendarDays size={30} /></div>
          <h2>No bookings yet.</h2>
          <p>Choose a diagnostic test to request your first appointment.</p>
        </div>
      )}
      {selectedBill && (
        <BillingPreview
          record={selectedBill}
          patient={user}
          centerSettings={paymentInfoByCenter[String(selectedBill.center?._id || selectedBill.center || "")] || { businessName: "Vitalia Diagnostics" }}
          onClose={() => setSelectedBill(null)}
        />
      )}
      {cancelCandidate && (
        <div
          className="modal-backdrop cancel-booking-backdrop"
          onClick={() => {
            if (workingId !== cancelCandidate.id) {
              setCancelCandidate(null);
              setCancelError("");
            }
          }}
        >
          <section
            className="cancel-booking-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            aria-describedby="cancel-booking-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cancel-booking-icon"><CalendarDays size={22} /></div>
            <span className="eyebrow">CANCEL APPOINTMENT</span>
            <h2 id="cancel-booking-title">Cancel this booking?</h2>
            <p id="cancel-booking-description">
              You’re about to cancel <strong>{cancelCandidate.testName}</strong> at {cancelCandidate.centerName}.
              This action cannot be undone.
            </p>
            {cancelError && <p className="form-error" role="alert">{cancelError}</p>}
            <div className="cancel-booking-actions">
              <button
                className="secondary-action"
                type="button"
                autoFocus
                disabled={workingId === cancelCandidate.id}
                onClick={() => { setCancelCandidate(null); setCancelError(""); }}
              >
                Keep booking
              </button>
              <button
                className="cancel-booking-confirm"
                type="button"
                disabled={workingId === cancelCandidate.id}
                onClick={() => handleCancel(cancelCandidate)}
              >
                {workingId === cancelCandidate.id ? "Cancelling…" : "Yes, cancel booking"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default Bookings;
