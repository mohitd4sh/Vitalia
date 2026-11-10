import { useEffect, useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import {
  downloadPatientReport,
  fetchUserReports,
} from "../services/api.js";

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReports() {
      try {
        const userReports = await fetchUserReports();
        if (active) {
          setReports(userReports);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    function loadWhenVisible() {
      if (document.visibilityState === "visible") loadReports();
    }

    loadReports();
    const refreshTimer = window.setInterval(loadWhenVisible, 5000);
    window.addEventListener("focus", loadWhenVisible);
    document.addEventListener("visibilitychange", loadWhenVisible);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", loadWhenVisible);
      document.removeEventListener("visibilitychange", loadWhenVisible);
    };
  }, []);

  async function handleDownload(report) {
    setDownloadingId(report.id);
    setError("");
    setMessage("");

    try {
      const file = await downloadPatientReport(report.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = report.fileName.replace(/[\\/\r\n"]/g, "_");
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReports((current) => current.filter((item) => item.id !== report.id));
      setMessage("Downloaded. This one-time report has been removed from your inbox.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDownloadingId("");
    }
  }

  return (
    <div className="content-page">
      <span className="eyebrow">YOUR HEALTH RECORDS</span>
      <h1>Medical reports.</h1>
      <p className="page-intro">
        Reports sent to you are available for one download and held temporarily
        for up to seven days or until the server restarts.
      </p>

      <div className="secure-note reports-security-note">
        <ShieldCheck size={18} />
        Report files are kept in memory only, delivered privately, and removed after download.
      </div>

      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {message && <p className="report-message report-success" role="status">{message}</p>}

      {loading ? (
        <div className="reports-empty" role="status">Loading your reports...</div>
      ) : reports.length ? (
        <div className="report-list">
          {reports.map((report) => (
            <article className="report-example report-item" key={report.id}>
              <div className="report-example-icon"><FileText size={22} /></div>
              <div className="report-item-copy">
                <strong>{report.testName}</strong>
                <p>{report.fileName} · Uploaded {new Date(report.uploadedAt).toLocaleString()}</p>
                {report.physicalCopyHandedOver && <p>Physical report copy handed to you.</p>}
                <p>Available until {new Date(report.expiresAt).toLocaleString()}</p>
              </div>
              <button
                className="report-download"
                onClick={() => handleDownload(report)}
                disabled={Boolean(downloadingId)}
              >
                <Download size={17} />
                {downloadingId === report.id ? "Downloading..." : "Download once"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="reports-empty">
          <div className="reports-empty-icon"><FileText size={32} /></div>
          <h2>Your reports will appear here.</h2>
          <p>
            When the care team sends a report to your account, it will be
            available here for a one-time download.
          </p>
        </div>
      )}
    </div>
  );
}

export default Reports;
