import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, CalendarDays, Clock3, FlaskConical, IndianRupee,
  Plus, Printer, RefreshCw, Search, Settings, ShieldCheck, Trash2, Users, Tag, Pencil,
} from "lucide-react";
import { Link } from "react-router-dom";
import BillingPreview from "../components/billing/BillingPreview.jsx";
import useConfirmDialog from "../hooks/useConfirmDialog.jsx";
import {
  archiveDiagnosticTest,
  confirmManualPayment,
  createStaffMember,
  deleteCenter,
  deleteCustomRole,
  deleteInventoryItem,
  fetchBillingRecords,
  fetchCoupons,
  saveCoupon,
  deactivateCoupon,
  fetchCenterSettings,
  fetchDiagnosticTests,
  fetchInventory,
  fetchManagedCenters,
  fetchOperationsOverview,
  reactivateDiagnosticTest,
  fetchPatients,
  fetchManagedAccounts,
  fetchRoleCatalog,
  fetchReportRecipients,
  fetchStaff,
  fetchPasswordChangeRequests,
  approvePasswordChangeRequest,
  saveCenter,
  saveCenterSettings,
  saveDiagnosticTest,
  saveInventoryItem,
  updateBookingStatus,
  updateStaffMember,
  updateAccountRole,
  createCustomRole,
  updateCustomRole,
  updateBuiltInRole,
  fetchBookings,
  uploadPatientReport,
} from "../services/api.js";
import { hasPermission } from "../services/permissions.js";

const dateTime = (value) => value ? new Date(value).toLocaleString() : "—";
const localDateKey = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
);
const todayDateKey = () => localDateKey(new Date());
function groupBookingsByAppointmentDate(bookings = []) {
  const sortedBookings = [...bookings].sort((first, second) => {
    const firstTime = new Date(first.appointmentAt).getTime();
    const secondTime = new Date(second.appointmentAt).getTime();
    if (!Number.isFinite(firstTime) && !Number.isFinite(secondTime)) return 0;
    return (Number.isFinite(firstTime) ? firstTime : Infinity)
      - (Number.isFinite(secondTime) ? secondTime : Infinity);
  });
  const groups = new Map();

  sortedBookings.forEach((booking) => {
    const date = new Date(booking.appointmentAt);
    const hasAppointmentDate = Number.isFinite(date.getTime());
    const dateKey = hasAppointmentDate ? localDateKey(date) : "unavailable";
    const group = groups.get(dateKey) || {
      key: dateKey,
      date: hasAppointmentDate ? date : null,
      bookings: [],
    };
    group.bookings.push(booking);
    groups.set(dateKey, group);
  });

  return [...groups.values()];
}
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value || 0);
const preciseMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(value) || 0);
const canUsePermission = (user, module, action) =>
  user?.role !== "custom" || hasPermission(user, module, action);
const SHARED_SETTINGS = "__shared__";

function AnimatedNumber({ value, formatter, duration = 1200 }) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const numericValue = Number(value) || 0;
    const startTime = performance.now();

    const tick = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(numericValue * easedProgress);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [duration, value]);

  const renderedValue = formatter ? formatter(displayValue) : displayValue;
  return <span className="counting-number">{renderedValue}</span>;
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="admin-page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="page-intro">{description}</p>
      </div>
      {action}
    </header>
  );
}

function Message({ error, success }) {
  return (
    <>
      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {success && <p className="report-message report-success" role="status">{success}</p>}
    </>
  );
}

function useLoad(loader, refreshInterval = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function syncData(initialLoad = false) {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await loader();
        if (active) {
          setData(result);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        inFlight = false;
        if (active && initialLoad) setLoading(false);
      }
    }
    function syncWhenVisible() {
      if (document.visibilityState === "visible") syncData();
    }
    syncData(true);
    const timer = window.setInterval(syncWhenVisible, refreshInterval);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [loader, refreshInterval]);
  return { data, setData, loading, error, reload, setError };
}

export function AdminOverview({ user }) {
  const [period, setPeriod] = useState("week");
  const [scheduleRange, setScheduleRange] = useState("today");
  const [patientSearch, setPatientSearch] = useState("");
  const overviewLoader = useCallback(() => fetchOperationsOverview({ period }), [period]);
  const { data, loading, error, reload } = useLoad(overviewLoader, 30000);
  const canReadFinance = canUsePermission(user, "finance", "read");
  const canReadPatients = canUsePermission(user, "patients", "read");
  const canReadBookings = canUsePermission(user, "bookings", "read");
  const formatCount = (value) => Number(value || 0).toLocaleString("en-IN");
  const formatShortDate = (value) => new Date(value).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
  const newPatientCount = Number(data?.newPatients);
  const tiles = [
    { label: "New patients", value: Number.isFinite(newPatientCount) ? newPatientCount : null, Icon: Users, tone: "gold", detail: `Registered this ${period}` },
    { label: "Total patients", value: Number(data?.patients) || 0, Icon: Users, tone: "peach", detail: "Registered patients" },
    { label: "Open appointments", value: Number(data?.activeBookings) || 0, Icon: CalendarDays, tone: "sage", detail: "Bookings in progress" },
    canReadFinance
      ? {
          label: "Collected revenue",
          value: Number(data?.paidRevenue) || 0,
          Icon: IndianRupee,
          tone: "lavender",
          detail: "Payments received",
          formatter: (value) => new Intl.NumberFormat("en-IN", {
            style: "currency", currency: "INR", maximumFractionDigits: 0,
          }).format(value),
        }
      : { label: "Active staff", value: Number(data?.staff) || 0, Icon: ShieldCheck, tone: "lavender", detail: "Team members" },
  ];
  const patientTrend = data?.patientTrend || [];
  const chartBaseline = 156;
  const chartMax = Math.max(1, ...patientTrend.map(({ count }) => count));
  const chartPoints = patientTrend.map(({ bucket, count }, index) => ({
    bucket,
    count,
    x: patientTrend.length > 1 ? 36 + (index / (patientTrend.length - 1)) * 548 : 310,
    y: chartBaseline - (count / chartMax) * 112,
  }));
  const chartLine = chartPoints.map(({ x, y }) => `${x},${y}`).join(" ");
  const chartArea = chartPoints.length
    ? `${chartPoints[0].x},${chartBaseline} ${chartLine} ${chartPoints[chartPoints.length - 1].x},${chartBaseline}`
    : "";
  const labelStep = period === "week" ? 1 : period === "month" ? 5 : 2;
  const diagnosticBreakdown = data?.diagnosticBreakdown || [];
  const maxDiagnosticCount = Math.max(1, ...diagnosticBreakdown.map(({ count }) => count));
  const patients = (data?.recentPatients || []).filter((patient) =>
    patient.name.toLowerCase().includes(patientSearch.trim().toLowerCase())
  );
  const appointments = (data?.upcomingBookings || []).filter((booking) =>
    scheduleRange === "week" || new Date(booking.appointmentAt).toDateString() === new Date().toDateString()
  );
  const shortcuts = [
    { label: "Bookings", path: "/admin/bookings", module: "bookings", Icon: CalendarDays },
    { label: "Patients", path: "/admin/patients", module: "patients", Icon: Users },
    { label: "Diagnostics", path: "/admin/tests", module: "diagnostics", Icon: FlaskConical },
  ].filter(({ module }) => canUsePermission(user, module, "read"));

  return (
    <div className="content-page admin-page admin-overview-page">
      <PageHeader
        eyebrow="CENTER OPERATIONS"
        title="Operations overview"
        description="A clear view of your patients, diagnostics, and appointment schedule."
        action={<button className="secondary-action" onClick={reload}><RefreshCw size={16} /> Refresh</button>}
      />
      <Message error={error} />
      {loading ? <div className="admin-empty" role="status">Loading operations…</div> : (
        <>
          <section className="admin-overview-stat-grid" aria-label="Center statistics">
            {tiles.map(({ label, value, Icon, tone, detail, formatter }) => (
              <article className={`admin-overview-stat admin-overview-stat-${tone}`} key={label}>
                <div className="admin-overview-stat-heading">
                  <span>{label}</span>
                  <Icon size={17} aria-hidden="true" />
                </div>
                <strong>{value !== null && Number.isFinite(value) && value >= 0
                  ? <AnimatedNumber value={value} formatter={formatter || formatCount} />
                  : "—"}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </section>

          <section className="admin-overview-content-grid">
            <div className="admin-overview-main-column">
              <article className="admin-overview-panel admin-overview-chart-panel">
                <header className="admin-overview-panel-heading">
                  <div>
                    <span className="eyebrow">PATIENT GROWTH</span>
                    <h2>New patients</h2>
                  </div>
                  <div className="admin-overview-period-switch" role="group" aria-label="Patient chart period">
                    {["week", "month", "year"].map((range) => (
                      <button
                        key={range}
                        type="button"
                        aria-pressed={period === range}
                        className={period === range ? "is-active" : ""}
                        onClick={() => setPeriod(range)}
                      >
                        {range === "week" ? "Week" : range === "month" ? "Month" : "Year"}
                      </button>
                    ))}
                  </div>
                </header>
                {canReadPatients ? patientTrend.length ? (
                  <>
                    <div className="admin-overview-chart-summary">
                      <strong>{formatCount(data?.newPatients)}</strong>
                      <span>new registrations</span>
                    </div>
                    <div className="admin-overview-chart">
                      <svg viewBox="0 0 620 205" role="img" aria-label={`New patient registrations by ${period}`}>
                        <defs>
                          <linearGradient id="patient-growth-fill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#e9c565" stopOpacity=".4" />
                            <stop offset="100%" stopColor="#e9c565" stopOpacity=".02" />
                          </linearGradient>
                        </defs>
                        {[44, 81, 118, chartBaseline].map((y) => (
                          <line key={y} x1="34" y1={y} x2="588" y2={y} className="admin-overview-chart-gridline" />
                        ))}
                        {chartArea && <polygon points={chartArea} fill="url(#patient-growth-fill)" />}
                        {chartPoints.length > 1 && <polyline points={chartLine} className="admin-overview-chart-line" />}
                        {chartPoints.map(({ bucket, count, x, y }, index) => {
                          const showLabel = index % labelStep === 0 || index === chartPoints.length - 1;
                          const date = period === "year"
                            ? new Date(`${bucket}-01T00:00:00`)
                            : new Date(`${bucket}T00:00:00`);
                          const label = period === "year"
                            ? date.toLocaleDateString("en", { month: "short" })
                            : period === "week"
                              ? date.toLocaleDateString("en", { weekday: "short" })
                              : date.toLocaleDateString("en", { day: "numeric", month: "short" });
                          return (
                            <g key={bucket}>
                              {count > 0 && <circle cx={x} cy={y} r="3.5" className="admin-overview-chart-dot" />}
                              {showLabel && <text x={x} y="187" textAnchor="middle" className="admin-overview-chart-label">{label}</text>}
                            </g>
                          );
                        })}
                      </svg>
                      {!patientTrend.some(({ count }) => count > 0) && (
                        <p className="admin-overview-chart-empty">No new registrations in this period.</p>
                      )}
                    </div>
                  </>
                ) : <p className="admin-overview-inline-empty">No patient registration data is available for this period.</p>
                  : <p className="admin-overview-inline-empty">Your role does not have permission to view patient trends.</p>}
              </article>

              <article className="admin-overview-panel admin-overview-diagnostics-panel">
                <header className="admin-overview-panel-heading">
                  <div>
                    <span className="eyebrow">BOOKING ACTIVITY</span>
                    <h2>Popular diagnostics</h2>
                  </div>
                  <FlaskConical size={19} aria-hidden="true" />
                </header>
                {canReadBookings ? diagnosticBreakdown.length ? (
                  <div className="admin-overview-diagnostic-list">
                    {diagnosticBreakdown.map(({ name, count }, index) => (
                      <div className="admin-overview-diagnostic-row" key={name}>
                        <div className="admin-overview-diagnostic-copy">
                          <span className={`admin-overview-diagnostic-marker marker-${index % 6}`} />
                          <span>{name}</span>
                          <strong>{formatCount(count)}</strong>
                        </div>
                        <div className="admin-overview-diagnostic-track" aria-hidden="true">
                          <span className={`marker-${index % 6}`} style={{ width: `${Math.max(4, (count / maxDiagnosticCount) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="admin-overview-inline-empty">No diagnostic bookings in this period.</p>
                  : <p className="admin-overview-inline-empty">Your role does not have permission to view booking trends.</p>}
              </article>

              <article className="admin-overview-panel admin-overview-patients-panel">
                <header className="admin-overview-panel-heading">
                  <div>
                    <span className="eyebrow">RECENT ACTIVITY</span>
                    <h2>New patients</h2>
                  </div>
                  {canReadPatients && shortcuts.some(({ module }) => module === "patients") && (
                    <Link to="/admin/patients" className="admin-overview-view-all">View all <ArrowUpRight size={14} /></Link>
                  )}
                </header>
                {canReadPatients ? (
                  <>
                    <label className="admin-overview-patient-search">
                      <Search size={15} aria-hidden="true" />
                      <input
                        type="search"
                        value={patientSearch}
                        onChange={(event) => setPatientSearch(event.target.value)}
                        placeholder="Search patients"
                        aria-label="Search recent patients"
                      />
                    </label>
                    <div className="admin-overview-patient-list">
                      {patients.length ? patients.map((patient, index) => (
                        <div className="admin-overview-patient-row" key={patient.id}>
                          <span className={`admin-overview-patient-avatar avatar-${index % 5}`}>
                            {patient.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                          </span>
                          <span className="admin-overview-patient-name">{patient.name}<small>Joined {formatShortDate(patient.createdAt)}</small></span>
                          <span className="admin-overview-patient-date">{formatShortDate(patient.createdAt)}</span>
                        </div>
                      )) : <p className="admin-overview-inline-empty">{patientSearch ? "No patients match your search." : "No patients to show yet."}</p>}
                    </div>
                  </>
                ) : <p className="admin-overview-inline-empty">Your role does not have permission to view patient records.</p>}
              </article>
            </div>

            <article className="admin-overview-panel admin-overview-schedule">
              <header className="admin-overview-panel-heading">
                <div>
                  <span className="eyebrow">UPCOMING</span>
                  <h2>Schedule</h2>
                </div>
                {canReadBookings && shortcuts.some(({ module }) => module === "bookings") && (
                  <Link to="/admin/bookings" className="admin-overview-view-all" aria-label="View all bookings"><ArrowUpRight size={16} /></Link>
                )}
              </header>
              <div className="admin-overview-schedule-toolbar">
                <span>{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                <div className="admin-overview-period-switch" role="group" aria-label="Schedule period">
                  {["today", "week"].map((range) => (
                    <button
                      key={range}
                      type="button"
                      aria-pressed={scheduleRange === range}
                      className={scheduleRange === range ? "is-active" : ""}
                      onClick={() => setScheduleRange(range)}
                    >
                      {range === "today" ? "Today" : "This week"}
                    </button>
                  ))}
                </div>
              </div>
              {canReadBookings ? (
                <div className="admin-overview-appointments">
                  {appointments.length ? appointments.map((booking) => (
                    <article className="admin-overview-appointment" key={booking.id}>
                      <div className="admin-overview-appointment-time">
                        <strong>{new Date(booking.appointmentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</strong>
                        <span>{new Date(booking.appointmentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      </div>
                      <div className="admin-overview-appointment-card">
                        <span className="admin-overview-appointment-icon"><CalendarDays size={15} aria-hidden="true" /></span>
                        <div className="admin-overview-appointment-details">
                          <strong>{booking.patientName}</strong>
                          <span>{booking.testName}</span>
                          <small><Clock3 size={12} />{booking.centerName || "Diagnostic center"}</small>
                        </div>
                        <span className={`admin-overview-status status-${booking.status}`}>{booking.status.replaceAll("_", " ")}</span>
                      </div>
                    </article>
                  )) : <div className="admin-overview-schedule-empty"><CalendarDays size={22} /><strong>No appointments {scheduleRange === "today" ? "today" : "this week"}</strong><span>Upcoming bookings will appear here.</span></div>}
                </div>
              ) : <p className="admin-overview-inline-empty">Your role does not have permission to view the appointment schedule.</p>}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export function AdminBookings({ staffRole = "", user }) {
  const canUpdate = canUsePermission(user, "bookings", "update");
  const canConfirmPayments = canUsePermission(user, "bookings", "update") ||
    canUsePermission(user, "finance", "update");
  const [statusFilter, setStatusFilter] = useState("all");
  const [appointmentDate, setAppointmentDate] = useState(todayDateKey);
  const [isViewingAll, setIsViewingAll] = useState(false);
  const bookingLoader = useCallback(() => fetchBookings({ status: statusFilter }), [statusFilter]);
  const resource = useLoad(bookingLoader);
  const visibleBookings = isViewingAll
    ? resource.data || []
    : (resource.data || []).filter((booking) => {
      const date = new Date(booking.appointmentAt);
      return Number.isFinite(date.getTime()) && localDateKey(date) === appointmentDate;
    });
  const [workingId, setWorkingId] = useState("");
  const [success, setSuccess] = useState("");
  const transitions = staffRole === "receptionist"
    ? ["confirmed", "cancelled"]
    : staffRole === "phlebotomist"
      ? ["sample_collected"]
      : staffRole === "technician"
        ? ["processing", "completed"]
        : ["confirmed", "sample_collected", "processing", "completed", "cancelled"];
  const validBookingTransitions = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["sample_collected", "cancelled"],
    sample_collected: ["processing"],
    processing: ["completed"],
  };
  async function changeStatus(booking, status) {
    setWorkingId(booking.id);
    resource.setError("");
    setSuccess("");
    try {
      await updateBookingStatus(booking.id, status, booking.notes || "");
      setSuccess(`Booking ${booking.id.slice(-6)} updated.`);
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    } finally {
      setWorkingId("");
    }
  }
  async function confirmPayment(booking) {
    setWorkingId(booking.id);
    resource.setError("");
    setSuccess("");
    try {
      const updatedBooking = await confirmManualPayment(booking.id);
      setSuccess(updatedBooking.status === "confirmed"
        ? `Payment received and booking ${booking.id.slice(-6)} confirmed.`
        : `Payment for booking ${booking.id.slice(-6)} marked as received.`);
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    } finally {
      setWorkingId("");
    }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="APPOINTMENTS" title="Manage bookings" description="Review appointments, update service status, and coordinate sample collection." />
      <Message error={resource.error} success={success} />
      <div className="admin-toolbar">
        <div className="admin-toolbar-filters">
          <label>Appointment date
            <input className="admin-input" type="date" value={appointmentDate} onChange={(event) => {
              setAppointmentDate(event.target.value || todayDateKey());
              setIsViewingAll(false);
            }} />
          </label>
          <button
            className="secondary-action"
            type="button"
            aria-pressed={isViewingAll}
            onClick={() => setIsViewingAll((viewingAll) => !viewingAll)}
          >
            {isViewingAll ? "View today" : "View all"}
          </button>
          <label>Filter status
            <select className="admin-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {["all", "pending", "confirmed", "sample_collected", "processing", "completed", "cancelled"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <button className="secondary-action" onClick={resource.reload}><RefreshCw size={16} /> Refresh bookings</button>
      </div>
      {resource.loading ? <div className="admin-empty" role="status">Loading bookings…</div> : visibleBookings.length ? (
        <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
          <thead><tr><th>Patient</th><th>Diagnostic test</th><th>Appointment</th><th>Collection</th><th>Payment</th><th>Status / action</th></tr></thead>
          <tbody>{groupBookingsByAppointmentDate(visibleBookings).map(({ key, date, bookings }) => (
            <Fragment key={key}>
              <tr className="admin-booking-date-row">
                <th scope="rowgroup" colSpan="6">
                  <CalendarDays size={15} />
                  <span>{date
                    ? date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                    : "Appointment date unavailable"}</span>
                  <small>{bookings.length} {bookings.length === 1 ? "booking" : "bookings"}</small>
                </th>
              </tr>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td><strong>{booking.patient?.name || "Patient"}</strong><small>{booking.patient?.email}</small></td>
                  <td>{booking.testName}<small>{money(booking.price)}</small></td>
                  <td>{dateTime(booking.appointmentAt)}<small>{booking.centerName}</small></td>
                  <td>{booking.collectionType === "home" ? "Home collection" : "At center"}</td>
                  <td><span className={`admin-status status-${booking.status === "cancelled" && booking.payment?.status === "pending" ? "cancelled" : booking.payment?.status}`}>{booking.status === "cancelled" && booking.payment?.status === "pending" ? "cancelled" : booking.payment?.status}</span><small>{booking.payment?.method || "—"}</small>{canConfirmPayments && booking.status !== "cancelled" && booking.payment?.status === "pending" && ["upi", "cash"].includes(booking.payment?.method) && ["", "receptionist"].includes(staffRole) && <button className="secondary-action" disabled={workingId === booking.id} onClick={() => confirmPayment(booking)}>Confirm received</button>}</td>
                  <td>{canUpdate ? <div className="admin-row-actions">
                    <span className={`admin-status status-${booking.status}`}>{booking.status.replaceAll("_", " ")}</span>
                    {(validBookingTransitions[booking.status] || []).some((status) => transitions.includes(status)) && (
                      <select aria-label={`Update booking ${booking.id}`} className="admin-input admin-inline-select" value="" disabled={workingId === booking.id} onChange={(event) => changeStatus(booking, event.target.value)}>
                        <option value="" disabled>Change status</option>
                        {(validBookingTransitions[booking.status] || []).filter((status) => transitions.includes(status)).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                      </select>
                    )}
                  </div> : booking.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table></div>
      ) : <div className="admin-empty">{isViewingAll
        ? "No bookings found."
        : `No bookings scheduled for ${new Date(`${appointmentDate}T00:00:00`).toLocaleDateString()}.`}</div>}
    </div>
  );
}

const blankTest = { name: "", category: "Blood", description: "", price: "", turnaround: "24 hours", homeCollection: false, active: true, centers: [], allCenters: false };

export function AdminTests({ user }) {
  const canCreate = canUsePermission(user, "diagnostics", "create");
  const canUpdate = canUsePermission(user, "diagnostics", "update");
  const canDelete = canUsePermission(user, "diagnostics", "delete");
  const loader = useCallback(async () => {
    const [tests, centers] = await Promise.all([fetchDiagnosticTests(), fetchManagedCenters()]);
    return { tests, centers };
  }, []);
  const resource = useLoad(loader);
  const [form, setForm] = useState(blankTest);
  const [editingId, setEditingId] = useState("");
  const [success, setSuccess] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  async function save(event) {
    event.preventDefault();
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 1 || price > 1000000) {
      resource.setError("Price must be between ₹1 and ₹1,000,000.");
      return;
    }
    try {
      await saveDiagnosticTest({
        ...form,
        centers: form.allCenters ? [] : form.centers,
        allCenters: form.allCenters,
        price,
        ...(editingId ? { id: editingId } : {}),
      });
      setForm(blankTest);
      setEditingId("");
      setSuccess("Diagnostic catalogue saved.");
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  async function archive(test) {
    if (!await confirm({
      eyebrow: "ARCHIVE DIAGNOSTIC",
      title: `Archive ${test.name}?`,
      description: "It will no longer be available for new bookings. Existing bookings will remain unchanged.",
      confirmLabel: "Archive diagnostic",
    })) return;
    try {
      await archiveDiagnosticTest(test._id || test.id);
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  async function reactivate(test) {
    try {
      await reactivateDiagnosticTest(test._id || test.id);
      await resource.reload();
      setSuccess("Diagnostic reactivated and available for new bookings.");
    } catch (error) { resource.setError(error.message); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="SERVICE CATALOGUE" title="Manage diagnostics" description="Maintain public test listings, prices, categories, turnaround times, and collection options for each test." />
      <Message error={resource.error} success={success} />
      {(canCreate || canUpdate) && <form className="admin-editor-grid" onSubmit={save}>
        <label>Test name<input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} required /></label>
        <label>Category<input className="admin-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={60} required /></label>
        <label>Price (INR)<input className="admin-input" type="number" min="1" max="1000000" step="1" value={form.price} onChange={(e) => { setForm({ ...form, price: e.target.value }); resource.setError(""); }} required /></label>
        <label>Turnaround<input className="admin-input" value={form.turnaround} onChange={(e) => setForm({ ...form, turnaround: e.target.value })} maxLength={80} /></label>
        <label className="admin-editor-wide">Description<textarea className="admin-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={2} /></label>
        <label className="admin-checkbox admin-editor-wide"><input type="checkbox" checked={form.homeCollection} onChange={(e) => setForm({ ...form, homeCollection: e.target.checked })} /> Offers home collection for this diagnostic</label>
        {user?.role === "center_master" ? (
          <p className="admin-help admin-editor-wide">This diagnostic is available only at {user.assignedCenterName || "your assigned center"}.</p>
        ) : (
          <div className="admin-editor-wide">
            <label className="admin-checkbox"><input type="checkbox" checked={form.allCenters} onChange={(e) => setForm({ ...form, allCenters: e.target.checked, centers: e.target.checked ? [] : form.centers })} /> Available at all centers</label>
            {!form.allCenters && <div className="admin-checkbox-list">{resource.data?.centers?.filter((center) => center.active).map((center) => {
              const centerId = center.id || center._id;
              return <label className="admin-checkbox" key={centerId}><input type="checkbox" checked={form.centers.includes(centerId)} onChange={(event) => setForm({ ...form, centers: event.target.checked ? [...form.centers, centerId] : form.centers.filter((id) => id !== centerId) })} /> {center.name} · {center.city}</label>;
            })}</div>}
          </div>
        )}
        <div className="admin-editor-actions"><button className="primary-button" type="submit" disabled={editingId ? !canUpdate : !canCreate}><Plus size={16} /> {editingId ? "Save changes" : "Add diagnostic"}</button>{editingId && <button className="secondary-action" type="button" onClick={() => { setForm(blankTest); setEditingId(""); }}>Cancel edit</button>}</div>
      </form>}
      {resource.loading ? <div className="admin-empty" role="status">Loading tests…</div> : (
        <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
          <thead><tr><th>Test</th><th>Category</th><th>Price</th><th>Turnaround</th><th>Collection</th><th>Centers</th><th>Availability</th><th>Actions</th></tr></thead>
          <tbody>{resource.data?.tests?.map((test) => <tr key={test._id || test.id}>
            <td><strong>{test.name}</strong><small>{test.description}</small></td><td>{test.category}</td><td>{money(test.price)}</td><td>{test.turnaround}</td><td>{test.homeCollection ? "Center or home" : "Center only"}</td><td>{test.centers?.length ? test.centers.map((id) => resource.data?.centers?.find((center) => String(center.id || center._id) === String(id))?.name || "Center").join(", ") : "All centers"}</td><td>{test.active ? "Listed" : "Archived"}</td>
            <td className="admin-row-actions">{canUpdate && <button className="secondary-action" onClick={() => { const selectedCenters = (test.centers || []).map(String); setEditingId(test._id || test.id); setForm({ ...blankTest, ...test, price: String(test.price), centers: selectedCenters, allCenters: selectedCenters.length === 0 }); }}>Edit</button>}{canUpdate && !test.active && <button className="secondary-action" onClick={() => reactivate(test)}>Reactivate</button>}{canDelete && test.active && <button className="delete-button" aria-label={`Archive ${test.name}`} onClick={() => archive(test)}><Trash2 size={16} /></button>}</td>
          </tr>)}</tbody>
        </table></div>
      )}
      {dialog}
    </div>
  );
}

export function AdminPatients() {
  const resource = useLoad(fetchPatients);
  const [query, setQuery] = useState("");
  const patients = (resource.data || []).filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="PATIENT DIRECTORY" title="Manage patients" description="View patient accounts and profile completion. Sensitive health details are intentionally not shown in this directory." />
      <Message error={resource.error} />
      <div className="search-toolbar"><Users size={18} /><input aria-label="Search patients" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email…" /></div>
      {resource.loading ? <div className="admin-empty" role="status">Loading patients…</div> : (
        <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
          <thead><tr><th>Patient</th><th>Account created</th><th>Profile</th></tr></thead>
          <tbody>{patients.map((patient) => <tr key={patient.id || patient._id}><td><strong>{patient.name}</strong><small>{patient.email}</small></td><td>{dateTime(patient.createdAt)}</td><td>{patient.profileCompleted ? "Complete" : "Setup required"}</td></tr>)}</tbody>
        </table>{!patients.length && <div className="admin-empty">No patients match this search.</div>}</div>
      )}
    </div>
  );
}

export function AdminReports({ staffMode = false, staffRole = "", user }) {
  const canCreate = canUsePermission(user, "reports", "create");
  const resource = useLoad(fetchReportRecipients);
  const [patientId, setPatientId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [testName, setTestName] = useState("");
  const [file, setFile] = useState(null);
  const [physicalCopyHandedOver, setPhysicalCopyHandedOver] = useState(false);
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    resource.setError("");
    setSuccess("");
    if (!file || file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      resource.setError("Choose a PDF file no larger than 10 MB.");
      return;
    }
    const body = new FormData();
    body.append("userId", patientId);
    body.append("bookingId", bookingId);
    body.append("testName", testName.trim());
    body.append("physicalCopyHandedOver", String(physicalCopyHandedOver));
    body.append("file", file);
    setSending(true);
    try {
      const response = await uploadPatientReport(body);
      setSuccess(response.message);
      setPatientId("");
      setBookingId("");
      setTestName("");
      setFile(null);
      setPhysicalCopyHandedOver(false);
      event.target.reset();
    } catch (error) { resource.setError(error.message); }
    finally { setSending(false); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader
        eyebrow="MEDICAL RECORD DELIVERY"
        title={staffMode ? "Patient report handover" : "Manage reports"}
        description={staffRole === "receptionist"
          ? "Record physical report handover and securely send the matching PDF to the patient's portal."
          : "Send a verified PDF directly to a patient and record any physical copy handover."}
      />
      <Message error={resource.error} success={success} />
      {canCreate && <form className="admin-editor-grid admin-report-form" onSubmit={submit}>
        <label>Patient<select className="admin-input" value={patientId} onChange={(e) => { setPatientId(e.target.value); setBookingId(""); }} required><option value="">Choose patient</option>{resource.data?.patients?.map((patient) => <option key={patient.id || patient._id} value={patient.id || patient._id}>{patient.name} · {patient.email}</option>)}</select></label>
        <label>Completed booking<select className="admin-input" value={bookingId} onChange={(e) => { const selectedBooking = resource.data?.bookings?.find((booking) => booking.id === e.target.value); setBookingId(e.target.value); if (selectedBooking) setTestName(selectedBooking.testName); }} required disabled={!patientId}><option value="">Choose completed booking</option>{resource.data?.bookings?.filter((booking) => booking.patientId === patientId).map((booking) => <option key={booking.id} value={booking.id}>{booking.testName} · {dateTime(booking.appointmentAt)}</option>)}</select></label>
        <label>Test / report title<input className="admin-input" value={testName} onChange={(e) => setTestName(e.target.value)} maxLength={120} required /></label>
        <label className="admin-editor-wide">PDF file<input className="admin-input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
        <label className="admin-checkbox admin-editor-wide"><input type="checkbox" checked={physicalCopyHandedOver} onChange={(event) => setPhysicalCopyHandedOver(event.target.checked)} /> Physical report copy has been handed to the patient</label>
        <p className="admin-help admin-editor-wide">Files are held in server memory, erased after successful download or within seven days, and lost on server restart. Maximum 10 MB per file.</p>
        <div className="admin-editor-actions"><button className="primary-button" disabled={sending || resource.loading}>{sending ? "Sending securely…" : physicalCopyHandedOver ? "Record handover & send PDF" : "Send PDF report"}</button></div>
      </form>}
    </div>
  );
}

const emptyCenter = { name: "", code: "", address: "", city: "", phone: "", openingHours: "", active: true };

export function AdminCenters({ user }) {
  const canCreate = user?.role !== "center_master" && canUsePermission(user, "centers", "create");
  const canUpdate = canUsePermission(user, "centers", "update");
  const canDelete = canUsePermission(user, "centers", "delete");
  const resource = useLoad(fetchManagedCenters);
  const [form, setForm] = useState(emptyCenter);
  const [centerMasterForm, setCenterMasterForm] = useState({ name: "", email: "", password: "" });
  const [editingId, setEditingId] = useState("");
  const canManageCenterMaster = editingId ? canUpdate : canCreate;
  const [success, setSuccess] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  async function submit(event) {
    event.preventDefault();
    try {
      await saveCenter({
        ...form,
        ...(canManageCenterMaster
          ? { centerMaster: editingId
            ? { name: centerMasterForm.name, email: centerMasterForm.email }
            : centerMasterForm }
          : {}),
        ...(editingId ? { id: editingId } : {}),
      });
      setForm(emptyCenter);
      setCenterMasterForm({ name: "", email: "", password: "" });
      setEditingId("");
      setSuccess(editingId
        ? "Diagnostic center and Center Master account saved."
        : "Diagnostic center and Center Master account created.");
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  async function remove(center) {
    if (!await confirm({
      eyebrow: "PERMANENTLY DELETE CENTER",
      title: `Delete ${center.name} permanently?`,
      description: "This cannot be undone. Historical records will be retained, and operational accounts assigned to this center will be deactivated.",
      confirmLabel: "Delete center",
    })) return;
    try {
      await deleteCenter(center.id || center._id);
      if (editingId === (center.id || center._id)) {
        setForm(emptyCenter);
        setEditingId("");
      }
      await resource.reload();
      setSuccess("Diagnostic center permanently deleted.");
    }
    catch (error) { resource.setError(error.message); }
  }
  async function updateCenter(center, changes) {
    try {
      await saveCenter({ ...center, ...changes, id: center.id || center._id });
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="FACILITY MANAGEMENT" title="Diagnostic centers" description="Manage diagnostic locations, contact details, and operating hours." />
      <Message error={resource.error} success={success} />
      {(canCreate || canUpdate) && <form className="admin-editor-grid" onSubmit={submit}>
        <label>Center name<input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
        <label>Center code<input className="admin-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={30} /></label>
        <label>City<input className="admin-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required maxLength={100} /></label>
        <label>Phone<input className="admin-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} /></label>
        <label className="admin-editor-wide">Address<input className="admin-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required maxLength={400} /></label>
        <label>Opening hours<input className="admin-input" value={form.openingHours} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} placeholder="Mon–Sat, 08:00–18:00" /></label>
        {canManageCenterMaster && <div className="admin-editor-wide">
          <h3>Center Master account</h3>
          <p className="admin-help">{editingId ? "Update the Center Master account name and email. Password changes use the account recovery flow." : "Create the account that will manage staff and operations for this center. Share the temporary password securely."}</p>
          <div className="admin-editor-grid">
            <label>Center Master name<input className="admin-input" autoComplete="name" value={centerMasterForm.name} onChange={(e) => setCenterMasterForm({ ...centerMasterForm, name: e.target.value })} required maxLength={100} /></label>
            <label>Email<input className="admin-input" type="email" autoComplete="email" value={centerMasterForm.email} onChange={(e) => setCenterMasterForm({ ...centerMasterForm, email: e.target.value })} required maxLength={254} /></label>
            {!editingId && <label>Temporary password<input className="admin-input" type="password" autoComplete="new-password" value={centerMasterForm.password} onChange={(e) => setCenterMasterForm({ ...centerMasterForm, password: e.target.value })} required minLength={8} maxLength={72} /></label>}
          </div>
        </div>}
        <div className="admin-editor-actions"><button className="primary-button" disabled={editingId ? !canUpdate : !canCreate}><Plus size={16} /> {editingId ? "Save center" : "Add center"}</button>{editingId && <button type="button" className="secondary-action" onClick={() => { setForm(emptyCenter); setCenterMasterForm({ name: "", email: "", password: "" }); setEditingId(""); }}>Cancel</button>}</div>
      </form>}
      <div className="admin-record-grid">{resource.data?.map((center) => <article className="admin-record-card" key={center.id || center._id}><span className="admin-status">{center.active ? "ACTIVE" : "INACTIVE"}</span><h3>{center.name}</h3><p>{center.code || "No code"} · {center.city}</p><p>{center.address}</p><p>{center.phone || "No phone"} · {center.openingHours || "Hours not set"}</p><div className="admin-row-actions">{canUpdate && <button className="secondary-action" onClick={() => { setEditingId(center.id || center._id); setForm({ ...center }); setCenterMasterForm({ name: center.centerMaster?.name || "", email: center.centerMaster?.email || "", password: "" }); }}>Edit</button>}{canDelete && <button className="delete-button" onClick={() => remove(center)} aria-label={`Delete ${center.name}`}><Trash2 size={16} /> Delete</button>}{canUpdate && !center.active && <button className="secondary-action" onClick={() => updateCenter(center, { active: true })}>Reactivate</button>}</div></article>)}</div>
      {!resource.loading && !resource.data?.length && <div className="admin-empty">Add a center before accepting online bookings.</div>}
      {dialog}
    </div>
  );
}

const emptyStaff = { name: "", email: "", password: "", staffRole: "receptionist", assignedCenter: "" };

export function AdminStaff({ user }) {
  const canCreate = canUsePermission(user, "staff", "create");
  const canUpdate = canUsePermission(user, "staff", "update");
  const loader = useCallback(async () => {
    const [staff, centers] = await Promise.all([fetchStaff(), fetchManagedCenters()]);
    return { staff, centers };
  }, []);
  const resource = useLoad(loader);
  const [form, setForm] = useState(emptyStaff);
  const [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      await createStaffMember(form);
      setForm(emptyStaff);
      setSuccess("Staff account created. Share the temporary password securely.");
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  async function update(member, values) {
    try { await updateStaffMember(member.id || member._id, values); await resource.reload(); }
    catch (error) { resource.setError(error.message); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="TEAM ACCESS" title="Staff management" description="Provision staff logins and assign least-privilege operational roles." />
      <Message error={resource.error} success={success} />
      {canCreate && <form className="admin-editor-grid" onSubmit={submit}>
        <label>Full name<input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Work email<input className="admin-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Temporary password<input className="admin-input" type="password" minLength={12} maxLength={72} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <label>Access role<select className="admin-input" value={form.staffRole} onChange={(e) => setForm({ ...form, staffRole: e.target.value })}><option value="receptionist">Receptionist · booking desk</option><option value="phlebotomist">Phlebotomist · sample collection</option><option value="technician">Lab technician · processing and reports</option></select></label>
        {user?.role === "center_master" ? <p className="admin-help">Staff will be assigned to {user.assignedCenterName || "your center"}.</p> : <label>Assigned center<select className="admin-input" value={form.assignedCenter} onChange={(e) => setForm({ ...form, assignedCenter: e.target.value })}><option value="">No center assignment</option>{resource.data?.centers?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name}</option>)}</select></label>}
        <div className="admin-editor-actions"><button className="primary-button"><Plus size={16} /> Create staff login</button></div>
      </form>}
      <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
        <thead><tr><th>Staff member</th><th>Role</th><th>Center</th><th>Access</th><th>Action</th></tr></thead>
        <tbody>{resource.data?.staff?.map((member) => <tr key={member.id || member._id}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{canUpdate ? <select className="admin-input admin-inline-select" value={member.staffRole} onChange={(e) => update(member, { staffRole: e.target.value })}><option value="receptionist">Receptionist</option><option value="phlebotomist">Phlebotomist</option><option value="technician">Lab technician</option></select> : member.staffRole}</td><td>{member.assignedCenter?.name || "Unassigned"}</td><td>{member.active ? "Active" : "Disabled"}</td><td>{canUpdate && <button className="secondary-action" onClick={() => update(member, { active: !member.active })}>{member.active ? "Disable" : "Enable"}</button>}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}

const customRoleModules = [
  { key: "dashboard", label: "Operations overview" },
  { key: "bookings", label: "Bookings" },
  { key: "diagnostics", label: "Diagnostics" },
  { key: "patients", label: "Patients" },
  { key: "reports", label: "Reports" },
  { key: "centers", label: "Centers" },
  { key: "staff", label: "Staff accounts" },
  { key: "inventory", label: "Inventory" },
  { key: "medicines", label: "Medicines" },
  { key: "messages", label: "Messages" },
  { key: "finance", label: "Finance & billing" },
  { key: "discounts", label: "Discounts & coupons" },
  { key: "settings", label: "Center settings" },
];
const customRoleActions = ["read", "create", "update", "delete"];
const customRoleActionSupport = {
  dashboard: ["read"],
  bookings: customRoleActions,
  diagnostics: customRoleActions,
  patients: ["read"],
  reports: ["read", "create"],
  centers: customRoleActions,
  staff: ["read"],
  inventory: customRoleActions,
  medicines: customRoleActions,
  messages: ["read", "update"],
  finance: ["read", "update"],
  discounts: customRoleActions,
  settings: ["read", "update"],
};
const emptyCustomRole = { name: "", description: "", permissions: [], center: "", allCenters: true };

export function AdminRoles({ currentUserId, user }) {
  const loader = useCallback(async () => {
    const [accounts, roleCatalog, centers] = await Promise.all([
      fetchManagedAccounts(),
      fetchRoleCatalog(),
      fetchManagedCenters(),
    ]);
    return { accounts, roles: roleCatalog.roles, builtInRoles: roleCatalog.builtInRoles, centers };
  }, []);
  const resource = useLoad(loader);
  const passwordRequestsLoader = useCallback(
    () => user?.role === "admin" ? fetchPasswordChangeRequests() : Promise.resolve([]),
    [user?.role]
  );
  const passwordRequestsResource = useLoad(passwordRequestsLoader);
  const [drafts, setDrafts] = useState({});
  const [editingAccountRoleId, setEditingAccountRoleId] = useState("");
  const [permissionEditorAccountId, setPermissionEditorAccountId] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordRequestAction, setPasswordRequestAction] = useState(null);
  const [roleForm, setRoleForm] = useState(emptyCustomRole);
  const [editingRoleId, setEditingRoleId] = useState("");
  const [editingBuiltInRoleKey, setEditingBuiltInRoleKey] = useState("");
  const { confirm, dialog } = useConfirmDialog();

  async function approvePasswordRequest(request) {
    setPasswordRequestAction({ id: request.id });
    passwordRequestsResource.setError("");
    setSuccess("");
    try {
      const result = await approvePasswordChangeRequest(request.id);
      setSuccess(result.message);
      await passwordRequestsResource.reload();
    } catch (error) {
      passwordRequestsResource.setError(error.message);
    } finally {
      setPasswordRequestAction(null);
    }
  }

  function updateDraft(account, changes) {
    const id = account.id || account._id;
    setDrafts((current) => ({
      ...current,
      [id]: {
        role: current[id]?.role ?? account.role,
        staffRole: current[id]?.staffRole ?? account.staffRole ?? "receptionist",
        customRoleId: current[id]?.customRoleId ?? account.customRoleId ?? "",
        assignedCenterId: current[id]?.assignedCenterId ?? account.assignedCenterId ?? "",
        permissionOverrides: current[id]
          ? current[id].permissionOverrides
          : account.hasPermissionOverride ? account.permissions : null,
        ...changes,
      },
    }));
    setSuccess("");
    resource.setError("");
  }

  async function saveAccountRole(account) {
    const id = account.id || account._id;
    const draft = drafts[id];
    if (!draft) return;
    try {
      await updateAccountRole(id, {
        role: draft.role,
        ...(draft.role === "staff" ? { staffRole: draft.staffRole } : {}),
        ...(draft.role === "custom" ? { customRoleId: draft.customRoleId } : {}),
        ...(draft.role === "custom" ? { permissionOverrides: draft.permissionOverrides } : {}),
        assignedCenter: draft.assignedCenterId || null,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setEditingAccountRoleId("");
      setSuccess(`Role updated for ${account.name}.`);
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    }
  }

  function startAccountRoleEdit(account) {
    const id = account.id || account._id;
    setDrafts((current) => ({
      ...current,
      [id]: {
        role: account.role,
        staffRole: account.staffRole || "receptionist",
        customRoleId: account.customRoleId || "",
        assignedCenterId: account.assignedCenterId || "",
        permissionOverrides: account.hasPermissionOverride ? account.permissions : null,
      },
    }));
    setEditingAccountRoleId(id);
    setPermissionEditorAccountId("");
    setSuccess("");
    resource.setError("");
  }

  function cancelAccountRoleEdit(account) {
    const id = account.id || account._id;
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (permissionEditorAccountId === id) setPermissionEditorAccountId("");
    setEditingAccountRoleId("");
  }

  async function toggleAccess(account) {
    const id = account.id || account._id;
    try {
      await updateAccountRole(id, { active: !account.active });
      setSuccess(`${account.name}'s account is now ${account.active ? "deactivated" : "active"}.`);
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    }
  }

  function togglePermission(module, action) {
    setRoleForm((current) => {
      const currentActions = current.permissions.find((entry) => entry.module === module)?.actions || [];
      const actions = new Set(currentActions);
      if (action === "read" && actions.has("read") && actions.size > 1) {
        return current;
      }
      if (actions.has(action)) actions.delete(action);
      else actions.add(action);
      if (action !== "read" && actions.size) actions.add("read");
      return {
        ...current,
        permissions: [
          ...current.permissions.filter((entry) => entry.module !== module),
          ...(actions.size ? [{ module, actions: [...actions] }] : []),
        ],
      };
    });
  }

  function toggleAccountPermission(account, module, action) {
    const id = account.id || account._id;
    const draft = drafts[id] || {
      role: account.role,
      customRoleId: account.customRoleId || "",
      permissionOverrides: account.hasPermissionOverride ? account.permissions : null,
    };
    const selectedRole = resource.data?.roles?.find((role) => role._id === draft.customRoleId);
    const currentPermissions = draft.permissionOverrides ?? selectedRole?.permissions ?? [];
    const currentActions = currentPermissions.find((entry) => entry.module === module)?.actions || [];
    const actions = new Set(currentActions);
    if (action === "read" && actions.has("read") && actions.size > 1) return;
    if (actions.has(action)) actions.delete(action);
    else actions.add(action);
    if (action !== "read" && actions.size) actions.add("read");
    const permissions = [
      ...currentPermissions.filter((entry) => entry.module !== module),
      ...(actions.size ? [{ module, actions: [...actions] }] : []),
    ];
    updateDraft(account, { permissionOverrides: permissions });
  }

  function editCustomRole(role) {
    setEditingRoleId(role._id);
    setEditingBuiltInRoleKey("");
    setRoleForm({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || [],
      center: role.center ? String(role.center) : "",
      allCenters: !role.center,
    });
    setSuccess("");
    resource.setError("");
  }

  function editBuiltInRole(role) {
    setEditingRoleId("");
    setEditingBuiltInRoleKey(role.role);
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: role.permissions || [],
      center: "",
      allCenters: true,
    });
    setSuccess("");
    resource.setError("");
  }

  function resetCustomRoleForm() {
    setEditingRoleId("");
    setEditingBuiltInRoleKey("");
    setRoleForm(emptyCustomRole);
  }

  async function saveCustomRole(event) {
    event.preventDefault();
    try {
      const roleFields = { ...roleForm, center: roleForm.allCenters ? null : roleForm.center || null };
      if (editingBuiltInRoleKey) {
        await updateBuiltInRole(editingBuiltInRoleKey, roleFields.permissions);
      } else if (editingRoleId) await updateCustomRole(editingRoleId, roleFields);
      else await createCustomRole(roleFields);
      setSuccess(editingBuiltInRoleKey
        ? "Built-in role permissions updated for all assigned accounts."
        : editingRoleId ? "Custom role updated." : "Custom role created.");
      resetCustomRoleForm();
      await resource.reload();
      if (editingBuiltInRoleKey) window.dispatchEvent(new Event("vitalia:permissions-updated"));
    } catch (error) {
      resource.setError(error.message);
    }
  }

  async function removeCustomRole(role) {
    if (!await confirm({
      eyebrow: "DELETE CUSTOM ROLE",
      title: `Delete "${role.name}"?`,
      description: "This role will be permanently removed. Make sure no accounts still need it.",
      confirmLabel: "Delete role",
    })) return;
    try {
      await deleteCustomRole(role._id);
      setSuccess(`Custom role "${role.name}" deleted.`);
      if (editingRoleId === role._id) resetCustomRoleForm();
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    }
  }

  return (
    <div className="content-page admin-page">
      <PageHeader
        eyebrow="ACCESS CONTROL"
        title="Role management"
        description="Review built-in account roles, create custom roles, then assign them to accounts."
      />
      <Message error={resource.error} success={success} />

      {user?.role === "admin" && (
        <section className="custom-role-section">
          <header className="custom-role-section-header">
            <div>
              <h2>Password change requests</h2>
              <p>Approve requests so users can change their password from the browser where they requested it.</p>
            </div>
            <button className="secondary-action" type="button" onClick={passwordRequestsResource.reload}><RefreshCw size={16} /> Refresh requests</button>
          </header>
          <Message error={passwordRequestsResource.error} />
          <div className="admin-table-panel admin-table-scroll">
            <table className="admin-table">
              <thead><tr><th>Account</th><th>Role</th><th>Requested</th><th>Action</th></tr></thead>
              <tbody>{(passwordRequestsResource.data || []).map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.user?.name}</strong><small>{request.user?.email}</small></td>
                  <td>{request.user?.role?.replaceAll("_", " ")}</td>
                  <td>{dateTime(request.createdAt)}</td>
                  <td><button className="secondary-action" type="button" disabled={Boolean(passwordRequestAction)} onClick={() => approvePasswordRequest(request)}>
                    {passwordRequestAction?.id === request.id ? "Approving…" : "Approve"}
                  </button></td>
                </tr>
              ))}</tbody>
            </table>
            {!passwordRequestsResource.loading && !passwordRequestsResource.error && !passwordRequestsResource.data?.length && <div className="admin-empty">No password change requests are waiting for approval.</div>}
          </div>
        </section>
      )}

      <section className="custom-role-section">
        <header className="custom-role-section-header">
          <div>
            <h2>{editingBuiltInRoleKey ? "Edit built-in role permissions" : editingRoleId ? "Edit custom role" : "Create a custom role"}</h2>
            <p>{editingBuiltInRoleKey
              ? "Changes apply to every account assigned to this built-in role. Create, update, and delete automatically include read access."
              : "Choose this role’s available actions and center scope. Create, update, and delete automatically include read access."}</p>
          </div>
        </header>
        <form id="custom-role-editor" className="custom-role-form" onSubmit={saveCustomRole}>
          <div className="admin-editor-grid custom-role-details">
            <label>
              Role name
              <input
                className="admin-input"
                value={roleForm.name}
                readOnly={Boolean(editingBuiltInRoleKey)}
                onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })}
                maxLength={60}
                required
              />
            </label>
            <label>
              Description
              <input
                className="admin-input"
                value={roleForm.description}
                readOnly={Boolean(editingBuiltInRoleKey)}
                onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })}
                maxLength={240}
                placeholder="Describe this role's responsibilities"
              />
            </label>
            {editingBuiltInRoleKey ? (
              <p className="admin-help">System role · permissions are shared across all accounts with this role.</p>
            ) : user?.role === "center_master" ? (
              <p className="admin-help">This role is limited to {user.assignedCenterName || "your assigned center"}.</p>
            ) : (
              <div>
                <label className="admin-checkbox"><input type="checkbox" checked={roleForm.allCenters} onChange={(event) => setRoleForm({ ...roleForm, allCenters: event.target.checked, center: event.target.checked ? "" : roleForm.center })} /> Shared across all centers</label>
                {!roleForm.allCenters && <label>Assigned center<select className="admin-input" value={roleForm.center} onChange={(event) => setRoleForm({ ...roleForm, center: event.target.value })} required><option value="">Choose center</option>{resource.data?.centers?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name} · {center.city}</option>)}</select></label>}
              </div>
            )}
          </div>
          <div className="custom-role-permissions" role="group" aria-label="Role permissions">
            <div className="custom-role-permission-row custom-role-permission-heading">
              <strong>Area</strong>
              {customRoleActions.map((action) => <strong key={action}>{action}</strong>)}
            </div>
            {customRoleModules.map(({ key, label }) => {
              const permissions = roleForm.permissions.find((entry) => entry.module === key)?.actions || [];
              const needsRead = permissions.some((action) => action !== "read");
              const activeBuiltInRole = resource.data?.builtInRoles?.find((role) => role.role === editingBuiltInRoleKey);
              const editableBuiltInModule = !editingBuiltInRoleKey || activeBuiltInRole?.editableModules.includes(key);
              return (
                <div className="custom-role-permission-row" key={key}>
                  <span>{label}</span>
                  {customRoleActions.map((action) => (
                    <label className="custom-role-checkbox" key={action}>
                      <input
                        type="checkbox"
                        disabled={!editableBuiltInModule ||
                          !customRoleActionSupport[key].includes(action) ||
                          !activeBuiltInRole?.editableActions?.[key]?.includes(action) && Boolean(activeBuiltInRole?.editableActions) ||
                          (action === "read" && needsRead)}
                        checked={permissions.includes(action)}
                        title={!editableBuiltInModule ? `${label} access is not applicable to this built-in role.` : !customRoleActionSupport[key].includes(action) ? `The ${action} action is not available for ${label}.` : `${action} ${label}`}
                        onChange={() => {
                          if (editableBuiltInModule && customRoleActionSupport[key].includes(action)) {
                            togglePermission(key, action);
                          }
                        }}
                        aria-label={`${action} ${label}`}
                      />
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="admin-editor-actions">
            <button className="primary-button" type="submit">
              <Plus size={16} /> {editingBuiltInRoleKey ? "Save permissions" : editingRoleId ? "Save role" : "Create role"}
            </button>
            {editingRoleId && (
              <button className="secondary-action" type="button" onClick={resetCustomRoleForm}>Cancel</button>
            )}
          </div>
        </form>

        <section className="custom-role-list" aria-labelledby="created-roles-title">
          <header className="custom-role-list-header">
            <div>
              <h3 id="created-roles-title">Created roles</h3>
              <p>Review custom roles and built-in roles available to your accounts.</p>
            </div>
            <span className="custom-role-count">
              {((resource.data?.roles || []).length + (resource.data?.builtInRoles || []).length)} roles
            </span>
          </header>
          {(resource.data?.builtInRoles || []).map((role) => {
            const assignedCount = (resource.data?.accounts || [])
              .filter((account) => account.role === role.role)
              .length;
            return (
              <article className="custom-role-card built-in-role-card" key={role.role}>
                <div>
                  <h3>{role.name}</h3>
                  <p>{role.description}</p>
                  <span>Built-in role · permissions shared across assigned accounts</span>
                  <span>{role.permissions.reduce((count, permission) => count + permission.actions.length, 0)} permissions · {assignedCount} assigned {assignedCount === 1 ? "account" : "accounts"}</span>
                </div>
                {user?.role === "admin" ? (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => {
                      editBuiltInRole(role);
                      document.getElementById("custom-role-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Edit permissions
                  </button>
                ) : <span className="custom-role-system-note">Administrator-only editor</span>}
              </article>
            );
          })}
          {(resource.data?.roles || []).map((role) => {
            const assignedCount = (resource.data?.accounts || [])
              .filter((account) => account.customRoleId === role._id)
              .length;
            return (
              <article className="custom-role-card" key={role._id}>
                <div>
                  <h3>{role.name}</h3>
                  <p>{role.description || "No description"}</p>
                  <span>{role.center ? resource.data?.centers?.find((center) => String(center.id || center._id) === String(role.center))?.name || "Assigned center" : "Shared across centers"}</span>
                  <span>{role.permissions.reduce((count, permission) => count + permission.actions.length, 0)} permissions · {assignedCount} assigned accounts</span>
                </div>
                <div className="admin-row-actions">
                  <button className="secondary-action" type="button" onClick={() => {
                    editCustomRole(role);
                    document.getElementById("custom-role-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>Edit role</button>
                  <button
                    className="delete-button"
                    type="button"
                    disabled={assignedCount > 0}
                    onClick={() => removeCustomRole(role)}
                    aria-label={`Delete ${role.name}`}
                    title={assignedCount > 0 ? "Reassign all accounts before deleting this role." : "Delete role"}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
          {!resource.loading && !resource.data?.roles?.length && !resource.data?.builtInRoles?.length && (
            <p className="custom-role-list-empty">No custom roles yet. Create one above to assign tailored access.</p>
          )}
        </section>
      </section>

      <section className="custom-role-section" id="account-role-assignments">
        <header className="custom-role-section-header">
          <div>
            <h2>Assign roles to accounts</h2>
            <p>Assign a role, then customize permissions for one account without changing the shared custom role.</p>
          </div>
        </header>
        {resource.loading ? (
          <div className="admin-empty" role="status">Loading accounts…</div>
        ) : (
          <div className="admin-table-panel admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr><th>Account</th><th>Account role</th><th>Assigned center</th><th>Staff permission / custom role</th><th>Access</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {(resource.data?.accounts || []).map((account) => {
                  const id = account.id || account._id;
                  const draft = drafts[id] || {
                    role: account.role,
                    staffRole: account.staffRole || "receptionist",
                    customRoleId: account.customRoleId || "",
                    assignedCenterId: account.assignedCenterId || "",
                    permissionOverrides: account.hasPermissionOverride ? account.permissions : null,
                  };
                  const hasChanges = draft.role !== account.role ||
                    (draft.role === "staff" && draft.staffRole !== account.staffRole) ||
                    (draft.role === "custom" && draft.customRoleId !== account.customRoleId) ||
                    draft.assignedCenterId !== (account.assignedCenterId || "") ||
                    (draft.role === "custom" && JSON.stringify(draft.permissionOverrides) !==
                      JSON.stringify(account.hasPermissionOverride ? account.permissions : null));
                  const isCurrentUser = id === currentUserId;
                  const isEditingRole = editingAccountRoleId === id;
                  const selectedRole = resource.data?.roles?.find((role) => role._id === draft.customRoleId);
                  const accountCenterName = resource.data?.centers?.find((center) =>
                    String(center.id || center._id) === String(account.assignedCenterId)
                  )?.name || account.assignedCenterName || "No center";
                  const editorPermissions = draft.permissionOverrides ?? selectedRole?.permissions ?? [];
                  const isPermissionEditorOpen = permissionEditorAccountId === id;
                  return (
                    <Fragment key={id}>
                      <tr>
                        <td><strong>{account.name}</strong><small>{account.email}</small></td>
                        <td>
                          {isEditingRole ? (
                            <select
                              className="admin-input admin-inline-select"
                              value={draft.role}
                              disabled={isCurrentUser}
                              onChange={(event) => updateDraft(account, {
                                role: event.target.value,
                                staffRole: event.target.value === "staff" ? (account.staffRole || "receptionist") : "",
                                customRoleId: event.target.value === "custom" ? (account.customRoleId || "") : "",
                                permissionOverrides: null,
                              })}
                              aria-label={`Role for ${account.name}`}
                            >
                              <option value="patient">Patient</option>
                              <option value="staff">Staff</option>
                              {user?.role !== "center_master" && <option value="admin">Administrator</option>}
                              <option value="center_master">Center Master</option>
                              <option value="custom" disabled={!resource.data?.roles?.length}>Custom role</option>
                            </select>
                          ) : (
                            <span className="account-role-value">
                              {account.role === "custom" ? account.customRoleName || "Custom role" : account.role.replaceAll("_", " ")}
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditingRole && user?.role !== "center_master" ? (
                            <select className="admin-input admin-inline-select" value={draft.assignedCenterId} disabled={isCurrentUser} onChange={(event) => updateDraft(account, { assignedCenterId: event.target.value })} aria-label={`Assigned center for ${account.name}`}>
                              <option value="">No center assignment</option>
                              {resource.data?.centers?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name}</option>)}
                            </select>
                          ) : (
                            <span>{user?.role === "center_master" ? user.assignedCenterName || "Assigned center" : accountCenterName}</span>
                          )}
                        </td>
                        <td>
                          {draft.role === "custom" ? (
                            isEditingRole ? (
                              <select
                                className="admin-input admin-inline-select"
                                value={draft.customRoleId}
                                disabled={isCurrentUser || !resource.data?.roles?.length}
                                onChange={(event) => updateDraft(account, {
                                  customRoleId: event.target.value,
                                  permissionOverrides: null,
                                })}
                                aria-label={`Custom role for ${account.name}`}
                              >
                                <option value="">Choose a custom role</option>
                                {resource.data?.roles?.map((role) => (
                                  <option key={role._id} value={role._id}>{role.name}</option>
                                ))}
                              </select>
                            ) : <span>{account.customRoleName || "Custom role"}</span>
                          ) : draft.role === "staff" ? (
                            isEditingRole ? (
                              <select
                                className="admin-input admin-inline-select"
                                value={draft.staffRole}
                                disabled={isCurrentUser}
                                onChange={(event) => updateDraft(account, { staffRole: event.target.value })}
                                aria-label={`Staff permission for ${account.name}`}
                              >
                                <option value="receptionist">Receptionist</option>
                                <option value="phlebotomist">Phlebotomist</option>
                                <option value="technician">Lab technician</option>
                              </select>
                            ) : <span>{(account.staffRole || "receptionist").replaceAll("_", " ")}</span>
                          ) : <span className="admin-role-empty">Not applicable</span>}
                        </td>
                        <td>
                          <span className={`admin-status ${account.active ? "status-paid" : "status-cancelled"}`}>
                            {account.active ? "Active" : "Deactivated"}
                          </span>
                          {account.role === "custom" && <small>{account.customRoleName || "Custom role"}</small>}
                          {isCurrentUser && <small>Current account</small>}
                        </td>
                        <td>
                          <div className="admin-row-actions">
                            {draft.role === "custom" && (
                              <button
                                className="secondary-action"
                                type="button"
                                disabled={isCurrentUser || isEditingRole || !draft.customRoleId}
                                aria-expanded={isPermissionEditorOpen}
                                onClick={() => {
                                  updateDraft(account, {});
                                  setPermissionEditorAccountId(isPermissionEditorOpen ? "" : id);
                                }}
                              >
                                {isPermissionEditorOpen ? "Close editor" : "Permissions"}
                              </button>
                            )}
                            {isEditingRole && (
                              <button
                                className="secondary-action"
                                type="button"
                                disabled={isCurrentUser || !hasChanges || (["custom", "center_master"].includes(draft.role) && (!draft.customRoleId && draft.role === "custom" || !draft.assignedCenterId))}
                                onClick={() => saveAccountRole(account)}
                              >
                                Save changes
                              </button>
                            )}
                            {isEditingRole ? (
                              <button
                                className="secondary-action"
                                type="button"
                                disabled={isCurrentUser}
                                onClick={() => cancelAccountRoleEdit(account)}
                              >
                                Cancel
                              </button>
                            ) : (
                              <>
                                {!isCurrentUser && (
                                  <button
                                    className="secondary-action"
                                    type="button"
                                    disabled={Boolean(editingAccountRoleId)}
                                    onClick={() => startAccountRoleEdit(account)}
                                  >
                                    Edit role
                                  </button>
                                )}
                                {!isCurrentUser && !hasChanges && (
                              <button
                                className={account.active ? "delete-button" : "secondary-action"}
                                type="button"
                                onClick={() => toggleAccess(account)}
                                aria-label={`${account.active ? "Deactivate" : "Reactivate"} ${account.name}`}
                              >
                                {account.active ? <><Trash2 size={15} /> Deactivate</> : "Reactivate"}
                              </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isPermissionEditorOpen && draft.role === "custom" && (
                        <tr className="account-permission-editor-row">
                          <td colSpan={6}>
                            <section className="account-permission-editor" aria-label={`Permissions for ${account.name}`}>
                              <header>
                                <div>
                                  <h3>Permissions for {account.name}</h3>
                                  <p>
                                    {draft.permissionOverrides === null
                                      ? `Using "${selectedRole?.name || "custom role"}" defaults. Change any permission to customize this account only.`
                                      : `These permissions apply only to ${account.name}. Other accounts using this role stay unchanged.`}
                                  </p>
                                </div>
                                {draft.permissionOverrides !== null && (
                                  <button className="secondary-action" type="button" onClick={() => updateDraft(account, { permissionOverrides: null })}>
                                    Use role defaults
                                  </button>
                                )}
                              </header>
                              <div className="custom-role-permissions" role="group" aria-label={`Permission matrix for ${account.name}`}>
                                <div className="custom-role-permission-row custom-role-permission-heading">
                                  <strong>Area</strong>
                                  {customRoleActions.map((action) => <strong key={action}>{action}</strong>)}
                                </div>
                                {customRoleModules.map(({ key, label }) => {
                                  const actions = editorPermissions.find((entry) => entry.module === key)?.actions || [];
                                  const needsRead = actions.some((action) => action !== "read");
                                  return (
                                    <div className="custom-role-permission-row" key={key}>
                                      <span>{label}</span>
                                      {customRoleActions.map((action) => (
                                        <label className="custom-role-checkbox" key={action}>
                                          <input
                                            type="checkbox"
                                            checked={actions.includes(action)}
                                            disabled={!customRoleActionSupport[key].includes(action) || (action === "read" && needsRead) || isCurrentUser}
                                            title={!customRoleActionSupport[key].includes(action) ? `The ${action} action is not available for ${label}.` : `${action} ${label}`}
                                            aria-label={`${action} ${label} for ${account.name}`}
                                            onChange={() => toggleAccountPermission(account, key, action)}
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="admin-editor-actions">
                                <button
                                  className="primary-button"
                                  type="button"
                                  disabled={isCurrentUser || !hasChanges}
                                  onClick={() => saveAccountRole(account)}
                                >
                                  Save permissions
                                </button>
                              </div>
                            </section>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!resource.data?.accounts?.length && <div className="admin-empty">No accounts are available.</div>}
          </div>
        )}
        <p className="admin-role-note">
          Per-account permission edits override the selected custom role for that account only; choose “Use role defaults” to restore inherited access. Permissions are enforced by the API. Accounts are deactivated rather than permanently deleted to preserve booking and report history. Users should sign in again after an access change. You cannot change your own access, and the last active administrator cannot be demoted.
        </p>
      </section>
      {dialog}
    </div>
  );
}

const emptyInventory = { id: "", name: "", sku: "", category: "", quantity: 0, reorderLevel: 5, unit: "units", center: "", expiresAt: null };

export function AdminInventory({ user }) {
  const canCreate = canUsePermission(user, "inventory", "create");
  const canUpdate = canUsePermission(user, "inventory", "update");
  const canDelete = canUsePermission(user, "inventory", "delete");
  const inventoryLoader = useCallback(async () => {
    const [items, centers] = await Promise.all([fetchInventory(), fetchManagedCenters()]);
    return { items, centers };
  }, []);
  const resource = useLoad(inventoryLoader);
  const [form, setForm] = useState(emptyInventory);
  const [success, setSuccess] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  async function submit(event) {
    event.preventDefault();
    try {
      await saveInventoryItem({ ...form, quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel), center: form.center || null });
      setForm(emptyInventory);
      setSuccess("Inventory item saved.");
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  async function remove(item) {
    if (!await confirm({
      eyebrow: "DELETE INVENTORY ITEM",
      title: `Delete ${item.name}?`,
      description: "This item will be permanently removed from inventory.",
      confirmLabel: "Delete item",
    })) return;
    try { await deleteInventoryItem(item.id || item._id); await resource.reload(); }
    catch (error) { resource.setError(error.message); }
  }
  function edit(item) {
    setForm({
      id: item.id || item._id,
      name: item.name,
      sku: item.sku,
      category: item.category,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
      unit: item.unit,
      center: item.center?.id || item.center?._id || "",
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 10) : null,
    });
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="SUPPLIES & REAGENTS" title="Inventory control" description="Track stock by SKU and center, set reorder thresholds, and flag expiry dates." />
      <Message error={resource.error} success={success} />
      {(canCreate || canUpdate) && <form className="admin-editor-grid" onSubmit={submit}>
        <label>Item name<input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>SKU<input className="admin-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
        <label>Category<input className="admin-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
        <label>Center<select className="admin-input" value={form.center || ""} onChange={(e) => setForm({ ...form, center: e.target.value })}><option value="">All / unassigned</option>{resource.data?.centers?.filter((center) => center.active).map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name}</option>)}</select></label>
        <label>Quantity<input className="admin-input" type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label>
        <label>Reorder at<input className="admin-input" type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} required /></label>
        <label>Unit<input className="admin-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></label>
        <label>Expires on<input className="admin-input" type="date" value={form.expiresAt || ""} onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })} /></label>
        <div className="admin-editor-actions"><button className="primary-button" disabled={form.id ? !canUpdate : !canCreate}><Plus size={16} /> {form.id ? "Save inventory changes" : "Add inventory item"}</button>{form.id && <button type="button" className="secondary-action" onClick={() => setForm(emptyInventory)}>Cancel edit</button>}</div>
      </form>}
      <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
        <thead><tr><th>Item / SKU</th><th>Category</th><th>Center</th><th>On hand</th><th>Expiry</th><th>Action</th></tr></thead>
        <tbody>{resource.data?.items?.map((item) => <tr key={item.id || item._id}><td><strong>{item.name}</strong><small>{item.sku}</small></td><td>{item.category}</td><td>{item.center?.name || "Unassigned"}</td><td><span className={item.quantity <= item.reorderLevel ? "inventory-low" : ""}>{item.quantity} {item.unit}{item.quantity <= item.reorderLevel ? " · REORDER" : ""}</span></td><td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "—"}</td><td className="admin-row-actions">{canUpdate && <button className="secondary-action" onClick={() => edit(item)}>Edit</button>}{canDelete && <button className="delete-button" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16} /></button>}</td></tr>)}</tbody>
      </table></div>
      {dialog}
    </div>
  );
}

export function AdminFinance({ user }) {
  const canReadSettings = canUsePermission(user, "settings", "read");
  const canUpdateSettings = canUsePermission(user, "settings", "update");
  const canConfirmPayments = canUsePermission(user, "finance", "update") ||
    canUsePermission(user, "bookings", "update");
  const resource = useLoad(fetchBillingRecords);
  const centersResource = useLoad(fetchManagedCenters);
  const [selectedCenterId, setSelectedCenterId] = useState(user?.assignedCenter || SHARED_SETTINGS);
  const effectiveCenterId = selectedCenterId === SHARED_SETTINGS ? "" : selectedCenterId;
  const settingsLoader = useCallback(
    () => canReadSettings ? fetchCenterSettings(effectiveCenterId) : Promise.resolve(null),
    [canReadSettings, effectiveCenterId]
  );
  const settingsResource = useLoad(settingsLoader);
  const [success, setSuccess] = useState("");
  const [upiDraft, setUpiDraft] = useState(null);
  const [filter, setFilter] = useState("all");
  const [savingUpi, setSavingUpi] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const records = resource.data || [];
  const paidRecords = records.filter((record) => record.status === "paid");
  const pendingRecords = records.filter((record) => record.status === "pending" && record.bookingStatus !== "cancelled");
  const totalFor = (payments) => payments.reduce((total, record) => total + (Number(record.amount) || 0), 0);
  const cashReceived = totalFor(paidRecords.filter((record) => record.method === "cash"));
  const upiReceived = totalFor(paidRecords.filter((record) => record.method === "upi"));
  const pendingTotal = totalFor(pendingRecords);
  const filteredRecords = records.filter((record) =>
    filter === "all" || record.status === filter || record.method === filter
  );
  async function saveUpi(event) {
    event.preventDefault();
    setSavingUpi(true);
    resource.setError("");
    settingsResource.setError("");
    setSuccess("");
    try {
      const settings = await saveCenterSettings({
        ...settingsResource.data,
        upiId: upiDraft ?? settingsResource.data?.upiId ?? "",
      }, effectiveCenterId);
      setUpiDraft(settings.upiId || "");
      setSuccess("UPI payment details saved.");
    } catch (error) {
      settingsResource.setError(error.message);
    } finally {
      setSavingUpi(false);
    }
  }
  async function confirmPayment(record) {
    try {
      const updatedBooking = await confirmManualPayment(record.bookingId);
      setSuccess(updatedBooking.status === "confirmed"
        ? `Payment received and booking ${record.bookingId.slice(-6)} confirmed.`
        : `Payment for booking ${record.bookingId.slice(-6)} marked as received.`);
      await resource.reload();
    } catch (error) { resource.setError(error.message); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="FINANCE & PAYMENTS" title="Finance and UPI" description="Manage patient UPI payment details and review confirmed cash flows across your center." />
      <Message error={resource.error} success={success} />
      <Message error={settingsResource.error} />
      {canReadSettings && <section className="admin-editor-grid finance-upi-form">
        <div>
          <span className="eyebrow">PATIENT UPI PAYMENTS</span>
          <h2>UPI account details</h2>
          <p className="admin-help">Patients use this ID and booking-specific QR code to pay. Transfers must be checked against your account before confirmation.</p>
        </div>
        {!canUpdateSettings ? <div className="admin-help">You have read-only access to payment settings.</div> : settingsResource.loading || !settingsResource.data ? <div className="admin-help">Loading payment settings…</div> : (
          <form className="finance-upi-fields" onSubmit={saveUpi}>
            {user?.role !== "center_master" && <label>Center<select className="admin-input" value={selectedCenterId} onChange={(event) => { setSelectedCenterId(event.target.value); setUpiDraft(null); }}><option value={SHARED_SETTINGS}>Shared default settings</option>{centersResource.data?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name} · {center.city}</option>)}</select></label>}
            <label>UPI ID<input className="admin-input" value={upiDraft ?? settingsResource.data.upiId ?? ""} onChange={(event) => setUpiDraft(event.target.value)} placeholder="yourname@bank" maxLength={100} /></label>
            <button className="primary-button" disabled={savingUpi}>{savingUpi ? "Saving…" : "Save UPI ID"}</button>
          </form>
        )}
      </section>}
      {resource.loading ? <div className="admin-empty" role="status">Loading cash-flow records…</div> : (
        <section className="admin-metric-grid finance-metric-grid">
          <article className="admin-metric"><span className="admin-metric-icon"><IndianRupee size={19} /></span><span>Total received</span><strong>{money(totalFor(paidRecords))}</strong></article>
          <article className="admin-metric"><span className="admin-metric-icon"><IndianRupee size={19} /></span><span>Cash received</span><strong>{money(cashReceived)}</strong></article>
          <article className="admin-metric"><span className="admin-metric-icon"><IndianRupee size={19} /></span><span>UPI received</span><strong>{money(upiReceived)}</strong></article>
          <article className="admin-metric"><span className="admin-metric-icon"><CalendarDays size={19} /></span><span>Awaiting confirmation · {pendingRecords.length}</span><strong>{money(pendingTotal)}</strong></article>
        </section>
      )}
      <section className="admin-workflow-note">
        <IndianRupee size={20} />
        <div><strong>Manual payment reconciliation</strong><p>Only mark a payment received after checking your bank or UPI account, or after physically receiving cash. UPI transfers are not automatically verified.</p></div>
      </section>
      <div className="admin-toolbar finance-toolbar">
        <label>Show records
          <select className="admin-input" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All payments</option><option value="paid">Received</option><option value="pending">Awaiting confirmation</option><option value="cash">Cash</option><option value="upi">UPI</option>
          </select>
        </label>
        <button className="secondary-action" onClick={resource.reload}><RefreshCw size={16} /> Refresh cash flows</button>
      </div>
      <div className="admin-table-panel admin-table-scroll"><table className="admin-table">
        <thead><tr><th>Patient</th><th>Booking / test</th><th>Amount</th><th>Method</th><th>Payment state</th><th>Received</th><th>Actions</th></tr></thead>
        <tbody>{filteredRecords.map((record) => <tr key={record.bookingId}><td><strong>{record.patient?.name || "—"}</strong><small>{record.patient?.email}</small></td><td>{record.bookingId.slice(-8).toUpperCase()}<small>{record.testName}</small></td><td>{money(record.amount)}</td><td>{record.method || "—"}</td><td><span className={`admin-status status-${record.status}`}>{record.status}</span></td><td>{dateTime(record.paidAt)}</td><td><div className="admin-row-actions">{record.bookingStatus !== "cancelled" && <button className="secondary-action" onClick={() => setSelectedBill(record)}><Printer size={15} /> Preview / print</button>}{canConfirmPayments && record.status === "pending" && record.bookingStatus !== "cancelled" && ["upi", "cash"].includes(record.method) && <button className="secondary-action" onClick={() => confirmPayment(record)}>Confirm received</button>}{record.bookingStatus === "cancelled" && "—"}</div></td></tr>)}</tbody>
      </table>{!resource.loading && !filteredRecords.length && <div className="admin-empty">No payments match this filter.</div>}</div>
      {selectedBill && (
        <BillingPreview
          record={selectedBill}
          centerSettings={settingsResource.data}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  );
}

const emptyCouponForm = {
  code: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderAmount: 0,
  usageLimit: "",
  maxUsesPerUser: 1,
  startsAt: "",
  expiresAt: "",
  active: true,
  centerId: "",
};

function couponDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function AdminDiscounts({ user }) {
  const canCreate = canUsePermission(user, "discounts", "create");
  const canUpdate = canUsePermission(user, "discounts", "update");
  const canDelete = canUsePermission(user, "discounts", "delete");
  const centersLoader = useCallback(
    () => user?.role === "admin" ? fetchManagedCenters() : Promise.resolve([]),
    [user?.role]
  );
  const centersResource = useLoad(centersLoader);
  const resource = useLoad(fetchCoupons);
  const [form, setForm] = useState(emptyCouponForm);
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  function editCoupon(coupon) {
    setForm({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount ?? "",
      minOrderAmount: coupon.minOrderAmount,
      usageLimit: coupon.usageLimit ?? "",
      maxUsesPerUser: coupon.maxUsesPerUser ?? 1,
      startsAt: couponDateInput(coupon.startsAt),
      expiresAt: couponDateInput(coupon.expiresAt),
      active: coupon.active,
      centerId: coupon.center?._id || coupon.center || "",
    });
    setSuccess("");
    resource.setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    resource.setError("");
    try {
      await saveCoupon({
        ...form,
        code: form.code.trim().toUpperCase(),
        discountValue: Number(form.discountValue),
        maxDiscount: form.discountType === "percentage" && form.maxDiscount !== ""
          ? Number(form.maxDiscount)
          : null,
        minOrderAmount: Number(form.minOrderAmount),
        usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
        maxUsesPerUser: Number(form.maxUsesPerUser),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        centerId: form.centerId || null,
      });
      setForm(emptyCouponForm);
      setSuccess(form.id ? "Discount updated." : "Coupon created.");
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCoupon(coupon) {
    if (coupon.active && !await confirm({
      eyebrow: "DEACTIVATE COUPON",
      title: `Deactivate ${coupon.code}?`,
      description: "Patients will no longer be able to use this coupon. Existing bookings are unchanged.",
      confirmLabel: "Deactivate coupon",
    })) return;
    try {
      if (coupon.active) {
        await deactivateCoupon(coupon.id);
      } else {
        await saveCoupon({
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscount: coupon.maxDiscount,
          minOrderAmount: coupon.minOrderAmount,
          usageLimit: coupon.usageLimit,
          maxUsesPerUser: coupon.maxUsesPerUser ?? 1,
          startsAt: coupon.startsAt,
          expiresAt: coupon.expiresAt,
          active: true,
          centerId: coupon.center?._id || coupon.center || null,
        });
      }
      setSuccess(`${coupon.code} ${coupon.active ? "deactivated" : "reactivated"}.`);
      await resource.reload();
    } catch (error) {
      resource.setError(error.message);
    }
  }

  const coupons = resource.data || [];
  function couponStatus(coupon) {
    if (!coupon.active) return "Inactive";
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) return "Expired";
    if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) return "Scheduled";
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) return "Limit reached";
    return "Active";
  }
  return (
    <div className="content-page admin-page">
      <PageHeader
        eyebrow="PROMOTIONS"
        title="Discounts & coupons"
        description="Create and manage coupon codes. Discounts are checked against the live booking price and applied by the server."
        action={<button className="secondary-action" onClick={resource.reload}><RefreshCw size={16} /> Refresh</button>}
      />
      <Message error={resource.error} success={success} />
      {(canCreate || (canUpdate && form.id)) && (
        <form className="admin-editor-grid coupon-editor" onSubmit={submit}>
          <div className="admin-editor-wide coupon-editor-heading">
            <span className="eyebrow">{form.id ? "EDIT COUPON" : "CREATE A COUPON"}</span>
            <h2>{form.id ? `Update ${form.code}` : "Set your offer"}</h2>
          </div>
          <label>Coupon code<input className="admin-input coupon-code-input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="e.g. VITALIA20" maxLength={32} pattern="[A-Za-z0-9_-]{3,32}" required /></label>
          <label>Discount type<select className="admin-input" value={form.discountType} onChange={(event) => setForm({ ...form, discountType: event.target.value, maxDiscount: event.target.value === "fixed" ? "" : form.maxDiscount })}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off (INR)</option></select></label>
          <label>Discount value<input className="admin-input" type="number" min="0.01" max={form.discountType === "percentage" ? "100" : "1000000"} step="0.01" value={form.discountValue} onChange={(event) => setForm({ ...form, discountValue: event.target.value })} required /></label>
          {form.discountType === "percentage" && <label>Maximum discount (INR)<input className="admin-input" type="number" min="0.01" step="0.01" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })} placeholder="No cap" /></label>}
          <label>Minimum booking amount (INR)<input className="admin-input" type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(event) => setForm({ ...form, minOrderAmount: event.target.value })} /></label>
          <label>Total uses allowed<input className="admin-input" type="number" min="1" step="1" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: event.target.value })} placeholder="Unlimited" /></label>
          <label>Uses allowed per user<input className="admin-input" type="number" min="1" max="10000000" step="1" value={form.maxUsesPerUser} onChange={(event) => setForm({ ...form, maxUsesPerUser: event.target.value })} required /></label>
          <label>Starts at<input className="admin-input" type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
          <label>Expires at<input className="admin-input" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
          {user?.role === "admin" && <label>Available at<select className="admin-input" value={form.centerId} onChange={(event) => setForm({ ...form, centerId: event.target.value })}><option value="">All centers</option>{centersResource.data?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name} · {center.city}</option>)}</select></label>}
          <label className="admin-checkbox coupon-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Coupon is active</label>
          <div className="admin-editor-actions">
            <button className="primary-button" disabled={saving || (form.id ? !canUpdate : !canCreate)}><Tag size={16} /> {saving ? "Saving…" : form.id ? "Save changes" : "Create coupon"}</button>
            {form.id && <button className="secondary-action" type="button" onClick={() => setForm(emptyCouponForm)}>Cancel edit</button>}
          </div>
        </form>
      )}
      {!canCreate && !canUpdate && <div className="admin-workflow-note"><Tag size={20} /><p>Your role has read-only access to discounts.</p></div>}
      {resource.loading ? <div className="admin-empty" role="status">Loading discounts…</div> : (
        <div className="admin-table-panel admin-table-scroll">
          <table className="admin-table coupon-table">
            <thead><tr><th>Coupon</th><th>Offer</th><th>Minimum</th><th>Total uses</th><th>Uses per user</th><th>Validity</th><th>Scope</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td><strong>{coupon.code}</strong></td>
                <td>{coupon.discountType === "percentage" ? `${coupon.discountValue}% off` : preciseMoney(coupon.discountValue)}{coupon.maxDiscount ? <small>Up to {preciseMoney(coupon.maxDiscount)}</small> : null}</td>
                <td>{coupon.minOrderAmount ? preciseMoney(coupon.minOrderAmount) : "None"}</td>
                <td>{coupon.usageCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : " / Unlimited"}</td>
                <td>{coupon.maxUsesPerUser ?? 1}</td>
                <td>{coupon.startsAt ? dateTime(coupon.startsAt) : "Now"}<small>Ends {coupon.expiresAt ? dateTime(coupon.expiresAt) : "never"}</small></td>
                <td>{coupon.center?.name || "All centers"}</td>
                <td><span className={`admin-status ${couponStatus(coupon) === "Active" ? "status-paid" : couponStatus(coupon) === "Scheduled" ? "status-pending" : "status-cancelled"}`}>{couponStatus(coupon)}</span></td>
                <td><div className="admin-row-actions">{canUpdate && <button className="secondary-action" onClick={() => editCoupon(coupon)}><Pencil size={14} /> Edit</button>}{coupon.active ? canDelete && <button className="delete-button" onClick={() => toggleCoupon(coupon)}>Deactivate</button> : canUpdate && <button className="secondary-action" onClick={() => toggleCoupon(coupon)}>Reactivate</button>}</div></td>
              </tr>
            ))}</tbody>
          </table>
          {!coupons.length && <div className="admin-empty">No coupons yet. Create one above to offer a discount at checkout.</div>}
        </div>
      )}
      {dialog}
    </div>
  );
}

export function AdminSettings({ user }) {
  const canUpdate = canUsePermission(user, "settings", "update");
  const centersResource = useLoad(fetchManagedCenters);
  const [selectedCenterId, setSelectedCenterId] = useState(user?.assignedCenter || SHARED_SETTINGS);
  const effectiveCenterId = selectedCenterId === SHARED_SETTINGS ? "" : selectedCenterId;
  const settingsLoader = useCallback(
    () => fetchCenterSettings(effectiveCenterId),
    [effectiveCenterId]
  );
  const resource = useLoad(settingsLoader);
  const [settingsChanges, setSettingsChanges] = useState(null);
  const form = settingsChanges || resource.data;
  const [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    try {
      setSettingsChanges(await saveCenterSettings(form, effectiveCenterId));
      setSuccess("Center settings saved.");
    } catch (error) { resource.setError(error.message); }
  }
  return (
    <div className="content-page admin-page">
      <PageHeader eyebrow="BUSINESS PROFILE" title="Center settings" description="Maintain the center identity and contact information used across operations." />
      <Message error={resource.error} success={success} />
      {user?.role !== "center_master" && <label className="center-scope-control">Center to manage<select className="admin-input" value={selectedCenterId} onChange={(event) => { setSelectedCenterId(event.target.value); setSettingsChanges(null); }}><option value={SHARED_SETTINGS}>Shared default settings</option>{centersResource.data?.map((center) => <option key={center.id || center._id} value={center.id || center._id}>{center.name} · {center.city}</option>)}</select></label>}
      {resource.loading || !form ? <div className="admin-empty" role="status">Loading settings…</div> : !canUpdate ? (
        <div className="admin-workflow-note"><Settings size={20} /><p>Your role has read-only access to center settings.</p></div>
      ) : (
        <form className="admin-editor-grid settings-editor" onSubmit={submit}>
          <label>Center / business name<input className="admin-input" value={form.name} onChange={(e) => setSettingsChanges({ ...form, name: e.target.value })} required maxLength={120} /></label>
          <label>Contact email<input className="admin-input" type="email" value={form.email} onChange={(e) => setSettingsChanges({ ...form, email: e.target.value })} /></label>
          <label>Contact phone<input className="admin-input" value={form.phone} onChange={(e) => setSettingsChanges({ ...form, phone: e.target.value })} /></label>
          <label>Timezone<input className="admin-input" value={form.timezone} onChange={(e) => setSettingsChanges({ ...form, timezone: e.target.value })} required /></label>
          <label className="admin-editor-wide">Business address<textarea className="admin-input" rows={3} value={form.address} onChange={(e) => setSettingsChanges({ ...form, address: e.target.value })} /></label>
          <div className="admin-editor-actions"><button className="primary-button"><Settings size={16} /> Save settings</button></div>
        </form>
      )}
      <p className="admin-help">Manage UPI payments and review cash flows from the Finance & UPI page.</p>
    </div>
  );
}
