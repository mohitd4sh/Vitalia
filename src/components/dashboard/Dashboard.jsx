import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  HeartPulse,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Pill,
  Search,
} from "lucide-react";
import { fetchBookings, fetchCenters, fetchDiagnosticTests } from "../../services/api.js";
import "../styles/dashboard.css";

const timeSlots = Array.from({ length: 12 }, (_, index) => {
  const hour = index + 7;
  return {
    label: `${String(hour % 12 || 12).padStart(2, "0")}:00 ${hour < 12 ? "am" : "pm"}`,
    hour,
  };
});

const initialTime = Date.now();
const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthStart(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getTimeSlotDate(date, hour) {
  const slot = new Date(date);
  slot.setHours(hour, 0, 0, 0);
  return slot;
}

function getInitialTimeSlot(timestamp) {
  const date = new Date(timestamp);
  return timeSlots.find(({ hour }) => getTimeSlotDate(date, hour).getTime() >= timestamp + 3600000)?.hour || 8;
}

function Dashboard({ user }) {
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const [overview, setOverview] = useState({ bookings: [], tests: [], centers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthStart(initialTime));
  const [selectedDate, setSelectedDate] = useState(() => new Date(initialTime));
  const [selectedHour, setSelectedHour] = useState(() => getInitialTimeSlot(initialTime));
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recommended");
  const today = new Date(currentTime);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      const results = await Promise.allSettled([
        fetchBookings({ mine: true }),
        fetchDiagnosticTests(),
        fetchCenters(),
      ]);
      if (!active) return;

      const [bookingsResult, testsResult, centersResult] = results;
      const failedResult = results.find((result) => result.status === "rejected");
      setOverview({
        bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
        tests: testsResult.status === "fulfilled" ? testsResult.value : [],
        centers: centersResult.status === "fulfilled" ? centersResult.value : [],
      });
      setError(failedResult?.reason?.message || "");
      setCurrentTime(Date.now());
      setLoading(false);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") loadOverview();
    }

    loadOverview();
    const refreshTimer = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const appointments = useMemo(() => overview.bookings
    .filter((booking) => booking.appointmentAt && booking.status !== "cancelled" && Number.isFinite(new Date(booking.appointmentAt).getTime()))
    .map((booking) => new Date(booking.appointmentAt))
    .sort((first, second) => first - second), [overview.bookings]);
  const appointmentDays = new Set(appointments.map(dateKey));
  const calendarDays = useMemo(() => {
    const firstOfMonth = getMonthStart(visibleMonth.getTime());
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const firstVisibleDate = new Date(firstOfMonth);
    firstVisibleDate.setDate(firstOfMonth.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstVisibleDate);
      date.setDate(firstVisibleDate.getDate() + index);
      return date;
    });
  }, [visibleMonth]);
  const diagnostics = useMemo(() => {
    const filtered = overview.tests.filter((test) =>
      `${test.name} ${test.category || ""} ${test.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())
    );
    if (sortBy === "name") return filtered.sort((first, second) => first.name.localeCompare(second.name));
    if (sortBy === "price") return filtered.sort((first, second) => Number(first.price) - Number(second.price));
    return filtered;
  }, [overview.tests, query, sortBy]);
  const recommendedTests = diagnostics.slice(0, 2);
  const selectedSlot = getTimeSlotDate(selectedDate, selectedHour);
  const hasSelectedSlot = selectedSlot.getTime() >= currentTime + 3600000;
  const getAppointmentLink = (test) => {
    const testQuery = test ? `&testId=${encodeURIComponent(test.id || test._id)}` : "";
    return `/tests?appointmentAt=${encodeURIComponent(selectedSlot.toISOString())}${testQuery}`;
  };

  function changeMonth(offset) {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    const lastDayOfMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    const nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(selectedDate.getDate(), lastDayOfMonth));
    setVisibleMonth(nextMonth);
    setSelectedDate(nextDate);
  }

  function selectDate(date) {
    setSelectedDate(date);
    setVisibleMonth(getMonthStart(date.getTime()));
    const firstAvailableSlot = timeSlots.find(({ hour }) => getTimeSlotDate(date, hour).getTime() >= currentTime + 3600000);
    if (firstAvailableSlot) setSelectedHour(firstAvailableSlot.hour);
  }

  return (
    <div className="dashboard-page patient-dashboard">
      <section className="patient-store-hero">
        <div className="patient-store-hero-copy">
          <span className="patient-store-sale-tag">YOUR VITALIA HEALTH HUB</span>
          <h1>Wellness starts with knowing.</h1>
          <p>Good to see you, {firstName}. Book trusted diagnostic tests, keep your health records close, and find the care you need in one place.</p>
          <div className="patient-store-hero-actions">
            <Link to="/tests" className="patient-store-primary-button">Explore lab tests <ArrowUpRight size={15} /></Link>
            <Link to="/bookings" className="patient-store-hero-link">View my bookings</Link>
          </div>
        </div>
        <div className="patient-store-hero-art" aria-hidden="true">
          <HeartPulse size={106} strokeWidth={1.3} />
        </div>
      </section>

      <section className="patient-store-categories" aria-labelledby="patient-category-title">
        <div className="patient-store-section-heading">
          <div><h2 id="patient-category-title">Popular health categories</h2><p>Everything you need to stay on top of your health.</p></div>
        </div>
        <div className="patient-store-category-grid">
          {[
            { label: "Lab tests", description: "Book diagnostics", path: "/tests", icon: HeartPulse, color: "blue" },
            { label: "Medicines", description: "Browse the catalogue", path: "/medicine-order", icon: Pill, color: "green" },
            { label: "Appointments", description: "Manage your bookings", path: "/bookings", icon: CalendarDays, color: "purple" },
            { label: "Medical reports", description: "View shared results", path: "/reports", icon: FileText, color: "orange" },
            { label: "Care team", description: "Message support", path: "/messages", icon: MessageCircle, color: "pink" },
            { label: "Patient help", description: "Find quick answers", path: "/help", icon: LifeBuoy, color: "teal" },
          ].map(({ label, description, path, icon: Icon, color }) => (
            <Link className="patient-store-category" to={path} key={path}>
              <span className={`patient-store-category-icon patient-store-category-icon-${color}`}><Icon size={19} /></span>
              <strong>{label}</strong>
              <small>{description}</small>
            </Link>
          ))}
        </div>
      </section>

      {error && <p className="dashboard-load-error" role="alert">Some dashboard details could not be refreshed: {error}</p>}

      <div className="patient-dashboard-toolbar">
        <div className="patient-store-section-heading patient-store-featured-heading">
          <div><h2>Featured diagnostics</h2><p>Handpicked tests from your diagnostic catalogue.</p></div>
          <span>{today.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}</span>
        </div>
        <div className="dashboard-toolbar-actions">
          <label className="dashboard-search">
            <Search size={15} />
            <input
              aria-label="Search diagnostics"
              placeholder="Search diagnostics..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort diagnostics">
              <option value="recommended">Recommended</option>
              <option value="name">Name</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>
      </div>

      <div className="patient-dashboard-grid">
        <section className="patient-panel diagnostics-panel" aria-labelledby="diagnostics-title">
          <div className="patient-panel-heading">
            <div>
              <span className="patient-panel-kicker">PERSONALIZED FOR YOU</span>
              <h2 id="diagnostics-title">Diagnostics</h2>
              <p>{diagnostics.length} available {diagnostics.length === 1 ? "diagnostic" : "diagnostics"}</p>
            </div>
            <Link to="/tests" className="patient-panel-link" aria-label="View all diagnostics">
              <ArrowUpRight size={17} />
            </Link>
          </div>

          <div className="diagnostic-list">
            {recommendedTests.map((test, index) => (
              <article className="patient-diagnostic-card" key={test._id || test.id || test.name}>
                <div className="diagnostic-card-top">
                  <span className={`patient-diagnostic-icon patient-diagnostic-icon-${index + 1}`}>
                    <span>{index + 1}</span>
                  </span>
                  <span className="diagnostic-category">{test.category || "Diagnostic test"}</span>
                  <span className="diagnostic-turnaround"><Clock3 size={12} /> {test.turnaround || "Varies"}</span>
                </div>
                <div className="patient-diagnostic-copy">
                  <h3>{test.name}</h3>
                  <p>{test.description || "Learn more about this diagnostic and booking options."}</p>
                </div>
                <div className="diagnostic-card-footer">
                  <strong>{currency.format(test.price || 0)}</strong>
                  {hasSelectedSlot
                    ? <Link to={getAppointmentLink(test)} className="patient-card-action">Make an appointment <ArrowUpRight size={14} /></Link>
                    : <span className="patient-card-action patient-card-action-disabled">No times left today</span>}
                </div>
              </article>
            ))}
            {!loading && !recommendedTests.length && (
              <div className="patient-empty-state">{error ? "Diagnostics could not be loaded." : "No diagnostics match your search."}</div>
            )}
            {loading && <div className="patient-empty-state" role="status">Loading diagnostics…</div>}
          </div>
          <Link to="/tests" className="patient-view-all">View all diagnostics <ArrowUpRight size={15} /></Link>
        </section>

        <section className="patient-panel schedule-panel" aria-labelledby="schedule-title">
          <div className="patient-panel-heading">
            <div>
              <span className="patient-panel-kicker">PLAN YOUR VISIT</span>
              <h2 id="schedule-title">Schedule your next appointment</h2>
              <p>Choose a day and a time that works for you.</p>
            </div>
          </div>

          <div className="calendar-month">
            <button type="button" className="calendar-nav" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <strong>{monthFormatter.format(visibleMonth)}</strong>
            <button type="button" className="calendar-nav" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="patient-calendar" role="grid" aria-label={monthFormatter.format(visibleMonth)}>
            {weekdays.map((weekday) => (
              <span className="calendar-weekday" key={weekday} role="columnheader">{weekday}</span>
            ))}
            {calendarDays.map((date) => {
              const isSelected = dateKey(date) === dateKey(selectedDate);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isPast = dateKey(date) < dateKey(today);
              return (
                <button
                  type="button"
                  className={`calendar-day${isCurrentMonth ? "" : " calendar-day-outside"}${isSelected ? " calendar-day-selected" : ""}${dateKey(date) === dateKey(today) ? " calendar-day-today" : ""}${appointmentDays.has(dateKey(date)) ? " calendar-day-booked" : ""}`}
                  key={dateKey(date)}
                  disabled={isPast}
                  onClick={() => selectDate(date)}
                  aria-label={`${dayFormatter.format(date)}${appointmentDays.has(dateKey(date)) ? ", appointment scheduled" : ""}`}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="time-slots-heading">
            <span>Choose time</span>
            <small>{dayFormatter.format(selectedDate)}</small>
          </div>
          <div className="time-slots">
            {timeSlots.map(({ label, hour }) => {
              const isSelected = selectedHour === hour;
              const isPast = getTimeSlotDate(selectedDate, hour).getTime() < currentTime + 3600000;
              return (
                <button
                  type="button"
                  className={`time-slot${isSelected ? " time-slot-selected" : ""}`}
                  key={hour}
                  disabled={isPast}
                  onClick={() => setSelectedHour(hour)}
                  aria-pressed={isSelected}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {hasSelectedSlot
            ? <Link to={getAppointmentLink()} className="schedule-appointment-button">Make an appointment <ArrowUpRight size={15} /></Link>
            : <span className="schedule-appointment-button schedule-appointment-button-disabled">No times available for this day</span>}
        </section>

        <section className="patient-panel centers-panel" aria-labelledby="centers-title">
          <div className="patient-panel-heading">
            <div>
              <span className="patient-panel-kicker">CARE CLOSE TO HOME</span>
              <h2 id="centers-title">Find a center near you</h2>
              <p>Explore our diagnostic centers.</p>
            </div>
            <Link to="/centers" className="patient-panel-link" aria-label="Explore diagnostic centers">
              <ArrowUpRight size={17} />
            </Link>
          </div>

          <div className="center-list">
            {overview.centers.slice(0, 4).map((center, index) => (
              <Link to={`/centers?centerId=${encodeURIComponent(center.id || center._id)}`} className="center-card" key={center.id || center._id || center.name}>
                <span className={`center-art center-art-${index + 1}`} aria-hidden="true">
                  <Building2 size={26} strokeWidth={1.5} />
                  <span />
                </span>
                <span className="center-card-copy">
                  <strong>{center.name}</strong>
                  <small>{center.address || "Diagnostic center"}</small>
                  <span><MapPin size={12} /> {center.city || "Vitalia network"}</span>
                </span>
                <ArrowUpRight className="center-card-arrow" size={14} />
              </Link>
            ))}
            {!loading && !overview.centers.length && (
              <div className="patient-empty-state">{error ? "Centers could not be loaded." : "No diagnostic centers are listed yet."}</div>
            )}
            {loading && <div className="patient-empty-state" role="status">Loading centers…</div>}
          </div>
          <Link to="/centers" className="patient-view-all">Explore all centers <ArrowUpRight size={15} /></Link>
        </section>
      </div>
      <section className="patient-store-bottom-banner">
        <div><span className="patient-store-sale-tag">HERE WHEN YOU NEED US</span><h2>Have questions about your care?</h2><p>Our support team can help you with bookings, reports, and your Vitalia account.</p></div>
        <Link to="/messages" className="patient-store-primary-button"><MessageCircle size={15} /> Contact support</Link>
      </section>
    </div>
  );
}

export default Dashboard;
