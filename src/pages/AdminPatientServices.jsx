import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCheck,
  MessageCircle,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import useConfirmDialog from "../hooks/useConfirmDialog.jsx";
import { hasPermission } from "../services/permissions.js";
import {
  closeSupportConversation,
  deleteMedicine,
  fetchAdminSupportConversations,
  fetchManagedMedicines,
  replyToSupportConversation,
  saveMedicine,
} from "../services/api.js";
import "./admin-patient-services.css";

const blankMedicine = {
  id: "",
  name: "",
  brand: "",
  strength: "",
  form: "",
  category: "",
  description: "",
  price: "0",
  mrp: "",
  discountPrice: "",
  stock: "0",
  requiresPrescription: true,
  active: true,
  retailProducts: [],
};

const blankRetailProduct = {
  market: "IN",
  brand: "",
  strength: "",
  form: "",
  packSize: "",
  manufacturer: "",
  retailer: "Apollo Pharmacy",
  sourceUrl: "",
  verifiedAt: new Date().toISOString().slice(0, 10),
};

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

function AdminPageHeader({ eyebrow, title, description, action }) {
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

function AdminMessage({ error, success }) {
  return (
    <>
      {error && <p className="report-message report-error" role="alert">{error}</p>}
      {success && <p className="report-message report-success" role="status">{success}</p>}
    </>
  );
}

export function AdminMedicines({ user }) {
  const canCreate = user?.role === "admin" || hasPermission(user, "medicines", "create");
  const canUpdate = user?.role === "admin" || hasPermission(user, "medicines", "update");
  const canDelete = user?.role === "admin" || hasPermission(user, "medicines", "delete");
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(blankMedicine);
  const [retailProduct, setRetailProduct] = useState(blankRetailProduct);
  const { confirm, dialog } = useConfirmDialog();

  const loadMedicines = useCallback(async () => {
    try {
      setMedicines(await fetchManagedMedicines());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchMedicines() {
      try {
        const data = await fetchManagedMedicines();
        if (active) {
          setMedicines(data);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchMedicines();
    return () => {
      active = false;
    };
  }, []);

  const visibleMedicines = useMemo(() => {
    const term = query.trim().toLowerCase();
    return medicines.filter((medicine) =>
      `${medicine.name} ${medicine.brand} ${medicine.strength} ${medicine.form} ${medicine.category} ${(medicine.retailProducts || []).map((product) => `${product.brand} ${product.strength} ${product.form} ${product.packSize} ${product.manufacturer}`).join(" ")}`.toLowerCase().includes(term)
    );
  }, [medicines, query]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    const fieldValue = name === "requiresPrescription"
      ? value === "unknown" ? null : value === "true"
      : type === "checkbox" ? checked : value;
    setForm((current) => ({ ...current, [name]: fieldValue }));
    setError("");
    setSuccess("");
  }

  function updateRetailProduct(event) {
    const { name, value } = event.target;
    setRetailProduct((current) => ({ ...current, [name]: value }));
  }

  function addRetailProduct() {
    if (
      !retailProduct.brand.trim() ||
      !retailProduct.strength.trim() ||
      !retailProduct.form.trim() ||
      !retailProduct.packSize.trim() ||
      !retailProduct.sourceUrl.trim() ||
      !retailProduct.verifiedAt
    ) {
      setError("Complete the brand, strength, form, pack size, source URL, and checked date.");
      return;
    }

    let sourceUrl;
    try {
      sourceUrl = new URL(retailProduct.sourceUrl);
    } catch {
      setError("Enter a valid HTTPS product-page URL for the retail listing.");
      return;
    }
    if (sourceUrl.protocol !== "https:") {
      setError("Retail source links must use HTTPS.");
      return;
    }

    setForm((current) => ({
      ...current,
      retailProducts: [
        ...current.retailProducts,
        {
          market: retailProduct.market,
          brand: retailProduct.brand.trim(),
          strength: retailProduct.strength.trim(),
          form: retailProduct.form.trim(),
          packSize: retailProduct.packSize.trim(),
          manufacturer: retailProduct.manufacturer.trim(),
          sources: [{
            retailer: retailProduct.retailer.trim(),
            url: sourceUrl.href,
            verifiedAt: retailProduct.verifiedAt,
          }],
        },
      ],
    }));
    setRetailProduct({ ...blankRetailProduct, verifiedAt: new Date().toISOString().slice(0, 10) });
    setError("");
    setSuccess("");
  }

  async function submitMedicine(event) {
    event.preventDefault();
    const price = Number(form.price);
    const mrp = form.mrp === "" ? null : Number(form.mrp);
    const discountPrice = form.discountPrice === "" ? null : Number(form.discountPrice);
    const stock = Number(form.stock);
    if (
      !Number.isFinite(price) || price < 0 ||
      (mrp !== null && (!Number.isFinite(mrp) || mrp <= 0)) ||
      (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0)) ||
      (mrp !== null && discountPrice !== null && discountPrice > mrp) ||
      !Number.isInteger(stock) || stock < 0
    ) {
      setError("Enter valid prices and a whole-number stock quantity. The discount price cannot exceed MRP.");
      return;
    }

    setWorking(true);
    setError("");
    setSuccess("");
    try {
      await saveMedicine({ ...form, price, mrp, discountPrice, stock });
      setForm(blankMedicine);
      setSuccess(form.id ? "Medicine details updated." : "Medicine added to the catalog.");
      await loadMedicines();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setWorking(false);
    }
  }

  async function removeMedicine(medicine) {
    if (!await confirm({
      eyebrow: "DELETE MEDICINE",
      title: `Delete ${medicine.name}?`,
      description: "This permanently removes the medicine from the catalog and patient search.",
      confirmLabel: "Delete medicine",
    })) return;

    setWorking(true);
    setError("");
    setSuccess("");
    try {
      await deleteMedicine(medicine.id || medicine._id);
      if (form.id === (medicine.id || medicine._id)) setForm(blankMedicine);
      setSuccess("Medicine deleted.");
      await loadMedicines();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setWorking(false);
    }
  }

  function editMedicine(medicine) {
    setForm({
      ...blankMedicine,
      ...medicine,
      id: medicine.id || medicine._id,
      price: String(medicine.price),
      mrp: medicine.mrp ?? medicine.retailProducts?.find((product) => product.mrp != null)?.mrp ?? "",
      discountPrice: medicine.discountPrice ?? medicine.retailProducts?.find((product) => product.discountPrice != null)?.discountPrice ?? "",
      stock: String(medicine.stock),
      retailProducts: medicine.retailProducts || [],
    });
    setRetailProduct({ ...blankRetailProduct, verifiedAt: new Date().toISOString().slice(0, 10) });
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="content-page admin-page admin-patient-services">
      <AdminPageHeader
        eyebrow="MEDICINE CATALOGUE"
        title="Manage medicines"
        description="Review generic list entries and manage verified retail pricing and stock."
        action={<button className="secondary-action" type="button" onClick={loadMedicines}><RefreshCw size={15} /> Refresh</button>}
      />
      <AdminMessage error={error} success={success} />

      {(canCreate || (canUpdate && form.id)) && <form className="admin-editor-grid medicine-admin-editor" onSubmit={submitMedicine}>
        <label>Medicine name<input className="admin-input" name="name" value={form.name} onChange={updateField} maxLength={120} required /></label>
        <label>Strength<input className="admin-input" name="strength" value={form.strength} onChange={updateField} maxLength={100} placeholder="e.g. 500 mg" /></label>
        <label>Form<input className="admin-input" name="form" value={form.form} onChange={updateField} maxLength={60} placeholder="e.g. tablet, capsule" /></label>
        <label>Category<input className="admin-input" name="category" value={form.category} onChange={updateField} maxLength={60} required /></label>
        <label>MRP (INR)<input className="admin-input" type="number" name="mrp" value={form.mrp} onChange={updateField} min="0.01" max="1000000" step="0.01" placeholder="Not listed" /></label>
        <label>Discount / listed price (INR)<input className="admin-input" type="number" name="discountPrice" value={form.discountPrice} onChange={updateField} min="0" max="1000000" step="0.01" placeholder="Not listed" /></label>
        <label>Stock quantity (0 means unavailable)<input className="admin-input" type="number" name="stock" value={form.stock} onChange={updateField} min="0" max="1000000" step="1" required /></label>
        <label>Prescription status
          <select className="admin-input" name="requiresPrescription" value={form.requiresPrescription === null ? "unknown" : String(form.requiresPrescription)} onChange={updateField}>
            <option value="unknown">Not specified</option>
            <option value="true">Prescription required</option>
            <option value="false">No prescription required</option>
          </select>
        </label>
        <label className="admin-editor-wide">Description<textarea className="admin-input" name="description" value={form.description} onChange={updateField} maxLength={500} rows={2} /></label>
        <fieldset className="retail-product-editor admin-editor-wide">
          <legend>Verified retail products ({form.retailProducts.length})</legend>
          <p>Record the source-listed MRP and selling price for this pack. The discount percentage is calculated only when both values are available.</p>
          <div className="retail-product-fields">
            <label>Market
              <select className="admin-input" name="market" value={retailProduct.market} onChange={updateRetailProduct}>
                <option value="IN">India</option>
                <option value="TZ">Tanzania</option>
              </select>
            </label>
            <label>Brand<input className="admin-input" name="brand" value={retailProduct.brand} onChange={updateRetailProduct} maxLength={100} /></label>
            <label>Strength<input className="admin-input" name="strength" value={retailProduct.strength} onChange={updateRetailProduct} maxLength={100} placeholder="e.g. 650 mg" /></label>
            <label>Dosage form<input className="admin-input" name="form" value={retailProduct.form} onChange={updateRetailProduct} maxLength={60} placeholder="e.g. Tablet" /></label>
            <label>Pack size<input className="admin-input" name="packSize" value={retailProduct.packSize} onChange={updateRetailProduct} maxLength={100} placeholder="e.g. 15 tablets" /></label>
            <label>Manufacturer<input className="admin-input" name="manufacturer" value={retailProduct.manufacturer} onChange={updateRetailProduct} maxLength={120} /></label>
            <label>Retail source
              <select className="admin-input" name="retailer" value={retailProduct.retailer} onChange={updateRetailProduct}>
                <option>Apollo Pharmacy</option>
                <option>Tata 1mg</option>
                <option>PharmEasy</option>
                <option>MedPlus</option>
                <option>Other</option>
              </select>
            </label>
            <label>Source checked<input className="admin-input" type="date" name="verifiedAt" value={retailProduct.verifiedAt} onChange={updateRetailProduct} /></label>
            <label className="retail-product-source-field">Product page URL<input className="admin-input" type="url" name="sourceUrl" value={retailProduct.sourceUrl} onChange={updateRetailProduct} placeholder="https://..." /></label>
            <button className="secondary-action retail-product-add" type="button" onClick={addRetailProduct}><Plus size={14} /> Add retail product</button>
          </div>
          {form.retailProducts.length > 0 && (
            <ul className="retail-product-list">
              {form.retailProducts.map((product, index) => (
                <li key={`${product.brand}-${product.strength}-${product.packSize}-${index}`}>
                  <span><strong>{product.brand} {product.strength}</strong><small>{product.form} · {product.packSize} · {product.manufacturer || "Manufacturer not listed"} · {product.market}</small><small>{product.mrp != null ? `MRP ${money(product.mrp)}` : "MRP not listed"} · {product.discountPrice != null ? `Selling price ${money(product.discountPrice)}` : "Selling price not listed"}</small><small>{product.sources.map((source) => source.retailer).join(", ")}</small></span>
                  <button className="delete-button" type="button" aria-label={`Remove ${product.brand} ${product.strength}`} onClick={() => setForm((current) => ({ ...current, retailProducts: current.retailProducts.filter((_, productIndex) => productIndex !== index) }))}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {form.id && <label className="admin-checkbox medicine-admin-checkbox"><input type="checkbox" name="active" checked={form.active} onChange={updateField} /> Available in patient search</label>}
        <div className="admin-editor-actions admin-editor-wide">
          {form.id ? canUpdate && <button className="primary-button" type="submit" disabled={working}><Plus size={16} /> {working ? "Saving…" : "Save medicine"}</button> : canCreate && <button className="primary-button" type="submit" disabled={working}><Plus size={16} /> {working ? "Saving…" : "Add medicine"}</button>}
          {form.id && <button className="secondary-action" type="button" onClick={() => { setForm(blankMedicine); setError(""); setSuccess(""); }}>Cancel edit</button>}
        </div>
      </form>}

      <div className="admin-toolbar medicine-admin-toolbar">
        <label className="medicine-admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicines..." aria-label="Search medicines" /></label>
        <span>{visibleMedicines.length} medicines</span>
      </div>
      {loading ? <div className="admin-empty" role="status">Loading medicines…</div> : (
        <div className="admin-table-panel admin-table-scroll">
          <table className="admin-table">
            <thead><tr><th>Medicine</th><th>Category</th><th>Retail products</th><th>MRP</th><th>Discount / listed price</th><th>Stock</th><th>Prescription</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{visibleMedicines.map((medicine) => (
              <tr key={medicine.id || medicine._id}>
                <td><strong>{medicine.name}</strong><small>{[medicine.strength, medicine.form].filter(Boolean).join(" · ") || "—"}</small></td>
                <td>{medicine.category}</td>
                <td>{medicine.retailProducts?.length || 0}</td>
                <td>{medicine.mrp != null ? money(medicine.mrp) : "Not listed"}</td>
                <td>{medicine.discountPrice != null ? money(medicine.discountPrice) : "Not listed"}</td>
                <td>{medicine.stock}</td>
                <td>{medicine.requiresPrescription === null ? "Not specified" : medicine.requiresPrescription ? "Required" : "Not required"}</td>
                <td><span className={`medicine-admin-status${medicine.active ? " medicine-admin-status-active" : ""}`}>{medicine.active ? "Available" : "Hidden"}</span></td>
                <td className="admin-row-actions">
                  {canUpdate && <button className="secondary-action" type="button" onClick={() => editMedicine(medicine)} disabled={working}><Pencil size={14} /> Edit</button>}
                  {canDelete && <button className="delete-button" type="button" onClick={() => removeMedicine(medicine)} disabled={working} aria-label={`Delete ${medicine.name}`}><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!visibleMedicines.length && <div className="admin-empty">{query ? "No medicines match this search." : "No medicines have been added yet."}</div>}
        </div>
      )}
      {dialog}
    </div>
  );
}

export function AdminSupportInbox({ user }) {
  const canUpdate = user?.role === "admin" || hasPermission(user, "messages", "update");
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetchAdminSupportConversations();
      setConversations(data);
      setSelectedId((current) => data.some((conversation) => conversation.id === current)
        ? current
        : data[0]?.id || "");
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await fetchAdminSupportConversations();
        if (active) {
          setConversations(data);
          setSelectedId((current) => data.some((conversation) => conversation.id === current)
            ? current
            : data[0]?.id || "");
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function submitReply(event) {
    event.preventDefault();
    if (!selectedConversation || !reply.trim()) return;
    setSending(true);
    setError("");
    setSuccess("");
    try {
      const updated = await replyToSupportConversation(selectedConversation.id, reply);
      setConversations((current) => [updated, ...current.filter((item) => item.id !== updated.id)]
        .sort((first, second) => new Date(second.lastMessageAt) - new Date(first.lastMessageAt)));
      setSelectedId(updated.id);
      setReply("");
      setSuccess("Reply sent to the patient.");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  }

  async function closeConversation() {
    if (!selectedConversation) return;
    if (!await confirm({
      eyebrow: "CLOSE SUPPORT CONVERSATION",
      title: `Close “${selectedConversation.subject}”?`,
      description: "The patient can still read this conversation and send a new message if they need more help.",
      confirmLabel: "Close conversation",
    })) return;
    setError("");
    setSuccess("");
    try {
      const updated = await closeSupportConversation(selectedConversation.id);
      setConversations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess("Conversation closed.");
    } catch (closeError) {
      setError(closeError.message);
    }
  }

  const openCount = conversations.filter((conversation) => conversation.status !== "closed").length;

  return (
    <div className="content-page admin-page admin-patient-services">
      <AdminPageHeader
        eyebrow="PATIENT SUPPORT"
        title="Messages"
        description="Review patient questions and reply directly from the support inbox."
        action={<button className="secondary-action" type="button" onClick={loadConversations}><RefreshCw size={15} /> Refresh</button>}
      />
      <AdminMessage error={error} success={success} />
      <div className="support-inbox-summary"><MessageCircle size={17} /> {openCount} open {openCount === 1 ? "conversation" : "conversations"}</div>

      <section className="support-inbox">
        <aside className="support-conversation-list" aria-label="Support conversations">
          {loading && <div className="admin-empty" role="status">Loading messages…</div>}
          {!loading && conversations.map((conversation) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            return (
              <button
                type="button"
                key={conversation.id}
                className={`support-conversation-option${selectedId === conversation.id ? " support-conversation-option-active" : ""}`}
                onClick={() => { setSelectedId(conversation.id); setReply(""); setSuccess(""); }}
              >
                <span className="support-conversation-option-top"><strong>{conversation.patient?.name || "Patient"}</strong><small>{new Date(conversation.lastMessageAt).toLocaleDateString()}</small></span>
                <span className="support-conversation-subject">{conversation.subject}</span>
                <span className="support-conversation-preview">{lastMessage?.body}</span>
                <span className={`support-status support-status-${conversation.status}`}>{conversation.status.replaceAll("_", " ")}</span>
              </button>
            );
          })}
          {!loading && !conversations.length && <div className="admin-empty">No patient messages yet.</div>}
        </aside>

        <div className="support-thread">
          {selectedConversation ? (
            <>
              <header className="support-thread-header">
                <div>
                  <span className="eyebrow">MESSAGE THREAD</span>
                  <h2>{selectedConversation.subject}</h2>
                  <p>{selectedConversation.patient?.name} · {selectedConversation.patient?.email}</p>
                </div>
                <div className="support-thread-header-actions">
                  <span className={`support-status support-status-${selectedConversation.status}`}>{selectedConversation.status.replaceAll("_", " ")}</span>
                  {canUpdate && selectedConversation.status !== "closed" && <button className="secondary-action" type="button" onClick={closeConversation}><Check size={15} /> Close</button>}
                </div>
              </header>

              <div className="support-thread-messages">
                {selectedConversation.messages.map((message) => (
                  <article className={`support-thread-message support-thread-message-${message.senderRole === "patient" ? "patient" : "admin"}`} key={message._id || message.id}>
                    <div><strong>{message.senderRole !== "patient" ? message.senderName || "Vitalia Support" : message.senderName || selectedConversation.patient?.name}</strong><time>{new Date(message.createdAt).toLocaleString()}</time></div>
                    <p>{message.body}</p>
                  </article>
                ))}
              </div>

              {selectedConversation.status === "closed"
                ? <p className="support-thread-closed"><CheckCheck size={16} /> This conversation is closed.</p>
                : canUpdate
                  ? (
                    <form className="support-reply-form" onSubmit={submitReply}>
                      <label htmlFor="support-admin-reply">Reply to patient</label>
                      <textarea id="support-admin-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={3000} rows={4} placeholder="Write a helpful reply..." required />
                      <div><small>{reply.length}/3000</small><button className="primary-button" type="submit" disabled={sending || !reply.trim()}><MessageCircle size={15} /> {sending ? "Sending…" : "Send reply"}</button></div>
                    </form>
                  )
                  : <p className="support-thread-closed">Read-only access: replying and closing conversations are disabled.</p>}
            </>
          ) : !loading && <div className="support-thread-empty"><PackagePlus size={26} /><strong>Select a conversation</strong><span>Choose a message from the inbox to read and reply.</span></div>}
        </div>
      </section>
      {dialog}
    </div>
  );
}
