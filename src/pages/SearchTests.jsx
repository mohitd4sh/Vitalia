import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CheckCircle2, Clock3, FlaskConical, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  createBooking,
  fetchCenters,
  fetchDiagnosticTests,
  validateCoupon,
} from "../services/api.js";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value || 0);
const preciseMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);
function toLocalDateTimeValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getInitialAppointmentAt(search) {
  const value = new URLSearchParams(search).get("appointmentAt");
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() >= Date.now() + 3600000
    ? toLocalDateTimeValue(date)
    : "";
}

function getEligibleCenters(test, centers) {
  return test.allCenters === false
    ? centers.filter((center) => test.centers?.some((id) => String(id) === String(center.id || center._id)))
    : centers;
}

const MIN_BOOKING_TIME = toLocalDateTimeValue(new Date(Date.now() + 3600000));

function SearchTests({ canBook = true, user }) {
  const location = useLocation();
  const [tests, setTests] = useState([]);
  const [centers, setCenters] = useState([]);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get("q") || "");
  const [category, setCategory] = useState("All");
  const [selectedTest, setSelectedTest] = useState(null);
  const [appointmentAt, setAppointmentAt] = useState(() => getInitialAppointmentAt(location.search));
  const [centerId, setCenterId] = useState("");
  const [collectionType, setCollectionType] = useState("center");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [bookingConfirmation, setBookingConfirmation] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const requestedCenterId = new URLSearchParams(location.search).get("centerId") || "";
  const homeCollectionAvailable = selectedTest?.homeCollection === true;
  const eligibleBookingCenters = selectedTest ? getEligibleCenters(selectedTest, centers) : centers;
  const bookingCenters = requestedCenterId
    ? eligibleBookingCenters.filter((center) => String(center.id || center._id) === requestedCenterId)
    : eligibleBookingCenters;

  useEffect(() => {
    if (!bookingConfirmation) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setBookingConfirmation(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bookingConfirmation]);

  function changeCollectionType(nextType) {
    setCollectionType(nextType);
    setAddress("");
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetchDiagnosticTests(), canBook ? fetchCenters() : Promise.resolve([])])
      .then(([testList, centerList]) => {
        if (!active) return;
        setTests(testList);
        setCenters(centerList);
        const preferredCenter = centerList.find((center) =>
          String(center.id || center._id) === requestedCenterId
        );
        setCenterId(preferredCenter?.id || preferredCenter?._id || centerList[0]?.id || centerList[0]?._id || "");
        const requestedTestId = new URLSearchParams(location.search).get("testId");
        const requestedTest = testList.find((test) =>
          String(test.id || test._id) === requestedTestId && test.active
        );
        if (requestedTest) {
          const eligibleCenters = getEligibleCenters(requestedTest, centerList);
          const preferredTestCenter = eligibleCenters.find((center) =>
            String(center.id || center._id) === requestedCenterId
          );
          const selectedCenter = preferredTestCenter || eligibleCenters[0];
          setCenterId(selectedCenter?.id || selectedCenter?._id || "");
          if (!requestedCenterId || preferredTestCenter) setSelectedTest(requestedTest);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [canBook, location.search, requestedCenterId]);

  const categories = useMemo(
    () => ["All", ...new Set(tests.map((test) => test.category))],
    [tests]
  );
  const filteredTests = useMemo(
    () => tests.filter((test) => {
      const matchesQuery = `${test.name} ${test.description}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesCenter = !requestedCenterId || getEligibleCenters(test, centers)
        .some((center) => String(center.id || center._id) === requestedCenterId);
      return test.active && matchesQuery && matchesCenter && (category === "All" || test.category === category);
    }),
    [tests, centers, query, category, requestedCenterId]
  );

  async function bookSelectedTest(event) {
    event.preventDefault();
    setError("");
    setBooking(true);
    try {
      if (couponCode.trim() && !couponPreview) {
        const preview = await validateCoupon({
          code: couponCode,
          testId: selectedTest._id || selectedTest.id,
          centerId,
        });
        setCouponPreview(preview);
      }
      const createdBooking = await createBooking({
        testId: selectedTest._id || selectedTest.id,
        centerId,
        appointmentAt: new Date(appointmentAt).toISOString(),
        collectionType,
        address,
        ...(couponCode.trim() ? { couponCode } : {}),
      });
      setBookingConfirmation(createdBooking);
      setSelectedTest(null);
      setAppointmentAt("");
      setAddress("");
      setCouponCode("");
      setCouponPreview(null);
      setCouponMessage("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBooking(false);
    }
  }

  async function applyCoupon() {
    setCouponMessage("");
    setCouponPreview(null);
    setCheckingCoupon(true);
    try {
      const preview = await validateCoupon({
        code: couponCode,
        testId: selectedTest._id || selectedTest.id,
        centerId,
      });
      setCouponPreview(preview);
      setCouponMessage(`${preview.code} applied. You save ${preciseMoney(preview.discountAmount)}.`);
    } catch (requestError) {
      setCouponMessage(requestError.message);
    } finally {
      setCheckingCoupon(false);
    }
  }

  return (
    <div className="content-page">
      <span className="eyebrow">DIAGNOSTIC DIRECTORY</span>
      <h1>Find the right test.</h1>
      <p className="page-intro">Explore active diagnostic services at your center.</p>
      {error && <p className="report-message report-error" role="alert">{error}</p>}

      <div className="search-toolbar">
        <Search size={19} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tests, health markers..." aria-label="Search diagnostic tests" />
      </div>
      <div className="filter-row">
        {categories.map((item) => (
          <button key={item} onClick={() => setCategory(item)} className={`filter-chip ${category === item ? "filter-chip-active" : ""}`}>{item}</button>
        ))}
      </div>
      <div className="results-caption">
        <strong>{filteredTests.length} tests</strong>
        <span>Live catalogue · Prices in INR</span>
      </div>

      {loading ? <div className="empty-state">Loading diagnostic catalogue…</div> : (
        <div className="test-list">
          {filteredTests.map((test) => (
            <article className="test-row" key={test._id || test.id}>
              <div className="test-row-icon"><FlaskConical size={22} /></div>
              <div className="test-row-info">
                <span className="test-category">{test.category}</span>
                <h3>{test.name}</h3>
                <p>{test.description}</p>
                <span className="test-time"><Clock3 size={14} /> {test.turnaround}</span>
              </div>
              <div className="test-row-price">
                <span>Price</span>
                <strong>{money(test.price)}</strong>
                {canBook && <button onClick={() => {
                  const eligibleCenters = getEligibleCenters(test, centers);
                  const preferredCenter = eligibleCenters.find((center) =>
                    String(center.id || center._id) === requestedCenterId
                  );
                  setSelectedTest(test);
                  setCenterId((current) => eligibleCenters.some((center) => String(center.id || center._id) === String(current))
                    ? current
                    : preferredCenter?.id || preferredCenter?._id || eligibleCenters[0]?.id || eligibleCenters[0]?._id || "");
                  setCollectionType("center");
                  setAddress("");
                  setCouponCode("");
                  setCouponPreview(null);
                  setCouponMessage("");
                  setError("");
                }}>Book test <ArrowUpRight size={15} /></button>}
              </div>
            </article>
          ))}
          {!filteredTests.length && <div className="empty-state">No tests found in the active catalogue.</div>}
        </div>
      )}

      {selectedTest && createPortal(
        <div className="modal-backdrop patient-booking-backdrop" onClick={() => setSelectedTest(null)}>
          <section className="selection-modal" role="dialog" aria-modal="true" aria-labelledby="booking-test-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedTest(null)} aria-label="Close">×</button>
            <div className="test-row-icon"><FlaskConical size={24} /></div>
            <span className="eyebrow">BOOK DIAGNOSTIC</span>
            <h2 id="booking-test-title">{selectedTest.name}</h2>
            <p>{selectedTest.description}</p>
            <div className="modal-price">{couponPreview ? preciseMoney(couponPreview.finalPrice) : money(selectedTest.price)} <span>INR</span></div>
            <form className="selection-modal-form" onSubmit={bookSelectedTest}>
              <div className="selection-modal-body">
                <label htmlFor="collection-type">Collection method</label>
                <select
                  id="collection-type"
                  className="admin-input"
                  value={collectionType}
                  onChange={(event) => changeCollectionType(event.target.value)}
                >
                  <option value="center">Visit center</option>
                  <option value="home" disabled={!homeCollectionAvailable}>
                    {homeCollectionAvailable ? "Home collection" : "Home collection (not offered for this test)"}
                  </option>
                </select>
                <label htmlFor="booking-center">Diagnostic center</label>
                <select id="booking-center" className="admin-input" value={centerId} onChange={(event) => { setCenterId(event.target.value); setCouponPreview(null); setCouponMessage(""); }} required>
                  <option value="">Choose center</option>
                  {bookingCenters.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name} · {center.city}</option>)}
                </select>
                <div className="booking-coupon-field">
                  <label htmlFor="booking-coupon">Coupon code</label>
                  <div className="booking-coupon-controls">
                    <input id="booking-coupon" className="admin-input coupon-code-input" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponPreview(null); setCouponMessage(""); }} placeholder="Enter coupon code" maxLength={32} />
                    <button className="secondary-action" type="button" onClick={applyCoupon} disabled={checkingCoupon || !couponCode.trim() || !centerId}>{checkingCoupon ? "Checking…" : "Apply"}</button>
                  </div>
                  {couponMessage && <p className={couponPreview ? "coupon-feedback coupon-feedback-success" : "coupon-feedback"} role={couponPreview ? "status" : "alert"}>{couponMessage}</p>}
                  {couponPreview && <p className="coupon-price-breakdown"><span>Test price: {preciseMoney(couponPreview.originalPrice)}</span><span>Coupon discount: −{preciseMoney(couponPreview.discountAmount)}</span><strong>Pay: {preciseMoney(couponPreview.finalPrice)}</strong></p>}
                </div>
                <label htmlFor="booking-date">Appointment date and time</label>
                <input
                  id="booking-date"
                  className="admin-input"
                  type="datetime-local"
                  inputMode="none"
                  min={MIN_BOOKING_TIME}
                  value={appointmentAt}
                  onChange={(event) => setAppointmentAt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Tab") event.preventDefault();
                  }}
                  onPaste={(event) => event.preventDefault()}
                  onDrop={(event) => event.preventDefault()}
                  required
                />
                {collectionType === "home" && <label htmlFor="collection-address">Collection address<input id="collection-address" className="admin-input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} required /></label>}
                {!centers.length && <p className="form-error">Online booking is not available until a center is configured.</p>}
                {error && <p className="form-error" role="alert">{error}</p>}
              </div>
              <div className="selection-modal-actions">
                <button className="primary-button" type="submit" disabled={booking || !centers.length}>{booking ? "Saving booking..." : "Request booking & pay"}</button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
      {bookingConfirmation && createPortal(
        <div className="modal-backdrop patient-booking-backdrop" onClick={() => setBookingConfirmation(null)}>
          <section
            className="selection-modal booking-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-confirmation-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" onClick={() => setBookingConfirmation(null)} aria-label="Close booking confirmation">×</button>
            <span className="booking-confirmation-icon"><CheckCircle2 size={27} /></span>
            <span className="eyebrow">BOOKING CONFIRMED</span>
            <h2 id="booking-confirmation-title">Your appointment is booked.</h2>
            <p className="booking-confirmation-reference">Reference: VTL-{String(bookingConfirmation.id).slice(-8).toUpperCase()}</p>
            <div className="booking-confirmation-details">
              <div><span>Diagnostic test</span><strong>{bookingConfirmation.testName}</strong></div>
              <div><span>Center</span><strong>{bookingConfirmation.centerName}</strong></div>
              <div><span>Appointment</span><strong>{new Date(bookingConfirmation.appointmentAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</strong></div>
              <div><span>Collection</span><strong>{bookingConfirmation.collectionType === "home" ? `Home collection · ${bookingConfirmation.address}` : "Visit diagnostic center"}</strong></div>
              <div><span>Booking status</span><strong className="booking-confirmation-status">{bookingConfirmation.status.replaceAll("_", " ")}</strong></div>
              <div><span>Payment status</span><strong>{bookingConfirmation.payment?.status || "unpaid"}</strong></div>
              {bookingConfirmation.discountAmount > 0 && <>
                <div><span>Original price</span><strong>{preciseMoney(bookingConfirmation.originalPrice)}</strong></div>
                <div><span>Coupon · {bookingConfirmation.couponCode}</span><strong>−{preciseMoney(bookingConfirmation.discountAmount)}</strong></div>
              </>}
              <div className="booking-confirmation-total"><span>Amount to pay</span><strong>{preciseMoney(bookingConfirmation.price)}</strong></div>
            </div>
            <div className="booking-confirmation-actions">
              {user?.role !== "custom" || user.permissions?.some((permission) => permission.module === "bookings" && permission.actions.includes("read"))
                ? <Link className="primary-button" to="/bookings" onClick={() => setBookingConfirmation(null)}>View my bookings</Link>
                : null}
              <button className="secondary-action" type="button" onClick={() => setBookingConfirmation(null)}>Continue browsing</button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SearchTests;
