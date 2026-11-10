import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Building2, Clock3, FlaskConical, MapPin, Phone, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCenters, fetchDiagnosticTests } from "../services/api.js";

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format(value || 0);

function getCenterId(center) {
  return String(center.id || center._id || "");
}

function isAvailableAtCenter(test, centerId) {
  return test.allCenters !== false ||
    test.centers?.some((id) => String(id) === String(centerId));
}

function Centers() {
  const [searchParams] = useSearchParams();
  const [centers, setCenters] = useState([]);
  const [tests, setTests] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selectedCenterId = searchParams.get("centerId") || "";
  const selectedCenter = centers.find((center) => getCenterId(center) === selectedCenterId);

  useEffect(() => {
    let active = true;

    Promise.all([fetchCenters(), fetchDiagnosticTests()])
      .then(([centerList, testList]) => {
        if (!active) return;
        setCenters(centerList);
        setTests(testList.filter((test) => test.active));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredCenters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return centers;
    return centers.filter((center) =>
      `${center.name} ${center.address} ${center.city}`.toLowerCase().includes(normalizedQuery)
    );
  }, [centers, query]);

  const centerTests = useMemo(
    () => selectedCenter
      ? tests.filter((test) => isAvailableAtCenter(test, selectedCenterId))
      : [],
    [tests, selectedCenter, selectedCenterId]
  );

  return (
    <div className="patient-feature-page centers-page">
      {selectedCenter ? (
        <>
          <Link className="centers-back-link" to="/centers">
            <ArrowLeft size={15} /> All centers
          </Link>
          <header className="centers-detail-header">
            <span className="eyebrow">VITALIA DIAGNOSTIC CENTER</span>
            <h1>{selectedCenter.name}</h1>
            <div className="centers-detail-meta">
              <span><MapPin size={15} /> {selectedCenter.address}, {selectedCenter.city}</span>
              {selectedCenter.phone && <a href={`tel:${selectedCenter.phone}`}><Phone size={15} /> {selectedCenter.phone}</a>}
              {selectedCenter.openingHours && <span><Clock3 size={15} /> {selectedCenter.openingHours}</span>}
            </div>
            <p className="page-intro">Choose a diagnostic test available at this center to start your booking.</p>
          </header>

          <section className="centers-tests-section" aria-labelledby="center-tests-title">
            <div className="centers-section-heading">
              <div>
                <h2 id="center-tests-title">Tests available here</h2>
                <p>{centerTests.length} {centerTests.length === 1 ? "test" : "tests"} available at this location</p>
              </div>
            </div>
            {loading ? (
              <div className="empty-state" role="status">Loading available tests…</div>
            ) : error ? (
              <p className="report-message report-error" role="alert">{error}</p>
            ) : centerTests.length ? (
              <div className="centers-test-grid">
                {centerTests.map((test) => {
                  const testId = test.id || test._id;
                  return (
                    <article className="centers-test-card" key={testId}>
                      <span className="centers-test-icon"><FlaskConical size={20} /></span>
                      <span className="test-category">{test.category || "Diagnostic test"}</span>
                      <h3>{test.name}</h3>
                      <p>{test.description || "Available to book at this diagnostic center."}</p>
                      <span className="centers-test-turnaround"><Clock3 size={13} /> {test.turnaround || "Varies"}</span>
                      <div className="centers-test-footer">
                        <strong>{money(test.price)}</strong>
                        <Link to={`/tests?centerId=${encodeURIComponent(selectedCenterId)}&testId=${encodeURIComponent(testId)}`}>
                          Book test <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                {error ? "Available tests could not be loaded." : "There are no tests available at this center yet."}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="patient-feature-heading centers-list-heading">
            <span className="eyebrow">CARE CLOSE TO HOME</span>
            <h1>Find a diagnostic center.</h1>
            <p>Explore Vitalia centers, check their location and hours, and book tests available at the center that works for you.</p>
          </header>

          <label className="search-toolbar centers-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by center name, city, or address"
              aria-label="Search diagnostic centers"
            />
          </label>

          {loading ? (
            <div className="empty-state" role="status">Loading diagnostic centers…</div>
          ) : error ? (
            <p className="report-message report-error" role="alert">{error}</p>
          ) : (
            <>
              <div className="centers-results-caption">
                <strong>{filteredCenters.length} {filteredCenters.length === 1 ? "center" : "centers"}</strong>
                <span>Active Vitalia locations</span>
              </div>
              <div className="centers-grid">
                {filteredCenters.map((center, index) => {
                  const centerId = getCenterId(center);
                  const availableCount = tests.filter((test) => isAvailableAtCenter(test, centerId)).length;
                  return (
                    <article className="centers-card" key={centerId || center.name}>
                      <span className={`centers-card-art centers-card-art-${(index % 4) + 1}`} aria-hidden="true">
                        <Building2 size={26} strokeWidth={1.5} />
                      </span>
                      <div className="centers-card-content">
                        <span className="centers-card-kicker">VITALIA CENTER</span>
                        <h2>{center.name}</h2>
                        <p><MapPin size={14} /> <span>{center.address}, {center.city}</span></p>
                        {center.openingHours && <p><Clock3 size={14} /> <span>{center.openingHours}</span></p>}
                        {center.phone && <p><Phone size={14} /> <a href={`tel:${center.phone}`}>{center.phone}</a></p>}
                        <div className="centers-card-footer">
                          <span>{loading ? "Loading tests…" : `${availableCount} ${availableCount === 1 ? "test" : "tests"} available`}</span>
                          <Link to={`/centers?centerId=${encodeURIComponent(centerId)}`} aria-label={`View tests at ${center.name}`}>
                            View tests <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!filteredCenters.length && <div className="empty-state">No centers match your search.</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Centers;
