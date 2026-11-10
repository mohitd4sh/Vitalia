import { Activity, Printer, X } from "lucide-react";

const dateTime = (value) => value ? new Date(value).toLocaleString() : "—";
const billMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2,
}).format(Number(value) || 0);

function BillingPreview({ record, centerSettings, patient, onClose }) {
  const bookingId = record.bookingId || record.id;
  const payment = record.payment || {};
  const amount = Number(record.amount ?? record.price) || 0;
  const subtotal = Number(record.originalPrice ?? amount) || 0;
  const discountAmount = Number(record.discountAmount) || 0;
  const paymentStatus = (record.payment ? payment.status : record.status) || "unpaid";
  const bookingStatus = (record.payment ? record.status : record.bookingStatus) || "pending";
  const method = record.method || payment.method;
  const reference = record.reference || payment.reference;
  const paidAt = record.paidAt || payment.paidAt;
  const patientDetails = record.patient || patient;
  const bookingReference = `VTL-${String(bookingId).slice(-8).toUpperCase()}`;
  const paid = paymentStatus === "paid";
  const refunded = paymentStatus === "refunded";
  const cancelled = bookingStatus === "cancelled";
  const centerName = record.centerName || record.center?.name || centerSettings?.name || centerSettings?.businessName || "Diagnostic center";
  const centerAddress = [
    record.center?.address || centerSettings?.address,
    record.center?.city,
  ].filter(Boolean).join(", ");
  const centerPhone = record.center?.phone || centerSettings?.phone;
  const centerEmail = centerSettings?.email;
  const balanceLabel = cancelled
    ? "Balance due on cancelled booking"
    : paid
      ? "Remaining balance"
      : refunded
        ? "Remaining balance after recorded refund"
        : paymentStatus === "pending"
          ? "Payment awaiting center confirmation"
          : "Balance due";

  return (
    <div className="bill-preview-backdrop" onClick={onClose}>
      <section
        className="bill-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bill-preview-toolbar">
          <div>
            <span className="eyebrow">BILL PREVIEW</span>
            <h2 id="bill-preview-title">Review before printing</h2>
          </div>
          <div className="bill-preview-actions">
            <button className="primary-button" type="button" onClick={() => window.print()}>
              <Printer size={16} /> Print bill
            </button>
            <button className="modal-close" type="button" onClick={onClose} aria-label="Close bill preview">
              <X size={18} />
            </button>
          </div>
        </header>

        <article className="billing-document">
          <header className="billing-document-header">
            <div className="billing-document-brand">
              <span className="billing-document-mark"><Activity size={22} /></span>
              <div>
                <span className="eyebrow">DIAGNOSTIC BILLING</span>
                <h1>{centerName}</h1>
              </div>
            </div>
            <div className="billing-document-meta">
              <strong>{bookingReference}</strong>
              <span>Generated {dateTime(new Date())}</span>
            </div>
          </header>

          <div className="billing-center-contact">
            {centerAddress && <span>{centerAddress}</span>}
            {centerPhone && <span>Phone: {centerPhone}</span>}
            {centerEmail && <span>Email: {centerEmail}</span>}
            {!centerAddress && !centerPhone && !centerEmail && (
              <span>Contact details are not available in this booking record.</span>
            )}
          </div>

          <section className="billing-parties">
            <div>
              <span className="billing-label">BILLED TO</span>
              <strong>{patientDetails?.name || "Patient name not recorded"}</strong>
              <span>{patientDetails?.email || "Email not recorded"}</span>
            </div>
            <div>
              <span className="billing-label">BOOKING DETAILS</span>
              <strong>{record.centerName || record.center?.name || centerName}</strong>
              <span>{dateTime(record.appointmentAt)}</span>
              <span>{record.collectionType === "home" ? "Home collection" : "Visit diagnostic center"}</span>
              {record.collectionType === "home" && (record.collectionAddress || record.address) && (
                <span>{record.collectionAddress || record.address}</span>
              )}
            </div>
          </section>

          <table className="billing-line-items">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{record.testName || "Diagnostic test"}</strong>
                  <small>Diagnostic test · Booking {bookingReference}</small>
                </td>
                <td>1</td>
                <td>{billMoney(subtotal)}</td>
                <td>{billMoney(subtotal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="billing-total-block">
            <div><span>Diagnostic test subtotal</span><strong>{billMoney(subtotal)}</strong></div>
            {discountAmount > 0 && <div><span>Coupon discount{record.couponCode ? ` (${record.couponCode})` : ""}</span><strong>−{billMoney(discountAmount)}</strong></div>}
            <div className="billing-total"><span>Total booking amount</span><strong>{billMoney(amount)}</strong></div>
            <div><span>Amount recorded as received</span><strong>{billMoney(paid || refunded ? amount : 0)}</strong></div>
            <div><span>{balanceLabel}</span><strong>{billMoney(!paid && !cancelled && !refunded ? amount : 0)}</strong></div>
          </div>

          <section className="billing-payment-details">
            <div>
              <span className="billing-label">PAYMENT STATUS</span>
              <strong className={`billing-payment-status status-${paymentStatus}`}>{paymentStatus}</strong>
            </div>
            <div>
              <span className="billing-label">PAYMENT METHOD</span>
              <strong>{method ? method.toUpperCase() : "Not recorded"}</strong>
            </div>
            <div>
              <span className="billing-label">BOOKING STATUS</span>
              <strong>{bookingStatus.replaceAll("_", " ")}</strong>
            </div>
            <div>
              <span className="billing-label">PAYMENT REFERENCE</span>
              <strong>{reference || "Not provided"}</strong>
            </div>
            <div>
              <span className="billing-label">PAYMENT RECEIVED</span>
              <strong>{paidAt ? dateTime(paidAt) : "Not confirmed"}</strong>
            </div>
          </section>

          <p className="billing-transparency-note">
            This statement reflects the booking price recorded by Vitalia. No separate tax or service fee is recorded for this booking. A payment is shown as received only after the center confirms it.
          </p>
          <footer className="billing-document-footer">
            <span>Thank you for choosing {centerName}.</span>
            <span>Keep this statement and booking reference if you need to request a duplicate later.</span>
          </footer>
        </article>
      </section>
    </div>
  );
}

export default BillingPreview;
