import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  MessageCircle,
  Pill,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  fetchMedicines,
  fetchMySupportConversations,
  replyToSupportConversation,
  saveUserProfile,
  sendSupportMessage,
} from "../services/api.js";
import "./patient-pages.css";

const medicineMoney = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(value);

function MedicineRetailPrice({ medicine, product }) {
  const mrp = medicine.mrp ?? product.mrp;
  const discountPrice = medicine.discountPrice ?? product.discountPrice;
  const pricesMatch = mrp != null && discountPrice != null &&
    Number(mrp) === Number(discountPrice);
  const hasDiscount = mrp != null && discountPrice != null &&
    Number(mrp) > Number(discountPrice);

  if (mrp == null && discountPrice == null) return null;

  return (
    <div className="medicine-retail-price">
      {hasDiscount ? (
        <>
          <small>MRP:</small>
          <del>{medicineMoney(mrp)}</del>
          <strong>{medicineMoney(discountPrice)}</strong>
        </>
      ) : pricesMatch ? (
        <strong>MRP: {medicineMoney(mrp)}</strong>
      ) : (
        <>
          {mrp != null && <small>MRP: {medicineMoney(mrp)}</small>}
          {mrp == null && discountPrice != null && (
            <strong>Listed Price: {medicineMoney(discountPrice)}</strong>
          )}
        </>
      )}
    </div>
  );
}

const emptyProfile = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  address: "",
  preferredLocation: "",
  homeCollection: false,
  emergencyName: "",
  emergencyPhone: "",
  relationship: "",
};

function getProfileForm(user) {
  const profile = user?.profile || {};
  return {
    ...emptyProfile,
    fullName: user?.name || "",
    dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().slice(0, 10) : "",
    gender: profile.gender === "prefer_not_to_say" ? "prefer-not-to-say" : profile.gender || "",
    phone: profile.phone || "",
    address: profile.address || "",
    preferredLocation: profile.preferredLocation || "",
    homeCollection: profile.homeCollection === true,
    emergencyName: profile.emergencyName || "",
    emergencyPhone: profile.emergencyPhone || "",
    relationship: profile.relationship || "",
  };
}

export function MedicineOrder() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchMedicines(query);
        if (active) {
          setMedicines(results);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, searchKey]);

  function submitSearch(event) {
    event.preventDefault();
    setSearchKey((current) => current + 1);
  }

  return (
    <div className="patient-feature-page">
      <header className="patient-feature-heading">
        <span className="eyebrow">YOUR MEDICINES</span>
        <h1>Medicine order.</h1>
        <p>Browse Indian retail products matched to generic medicine names.</p>
      </header>

      <section className="patient-feature-card medicine-search-card">
        <div className="patient-feature-icon"><Pill size={22} /></div>
        <h2>Search the medicine catalogue</h2>
        <p>Brand, strength, dosage form, and pack size are shown with links to the pharmacy sources. Prices and stock are not included.</p>
        <form className="medicine-search-form" onSubmit={submitSearch}>
          <label htmlFor="medicine-query">Find a medicine</label>
          <div className="medicine-search-control">
            <Search className="medicine-search-icon" size={18} aria-hidden="true" />
            <input
              id="medicine-query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by medicine name, brand, or strength"
              autoComplete="off"
            />
            {query && (
              <button
                className="medicine-search-clear"
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear medicine search"
              >
                Clear
              </button>
            )}
            <button className="medicine-search-submit" type="submit" aria-label="Search medicines">
              <Search size={15} aria-hidden="true" />
              <span>Search</span>
            </button>
          </div>
          <span className="patient-feature-hint" role="status">{loading ? "Searching the catalogue…" : `${medicines.length} ${medicines.length === 1 ? "medicine" : "medicines"} found`}</span>
        </form>
        {error && <p className="patient-form-message patient-form-error" role="alert">{error}</p>}
        {!loading && !error && !medicines.length && (
          <div className="medicine-empty-state">{query ? "No medicines matched your search." : "No medicines have been added to the catalog yet."}</div>
        )}
        {medicines.length > 0 && (
          <div className="medicine-results">
            {medicines.map((medicine) => (
              <article className="medicine-result-card" key={medicine._id || medicine.id}>
                <span className="medicine-result-icon"><Pill size={19} /></span>
                <div className="medicine-result-details">
                  <strong>{medicine.name}</strong>
                </div>
                <span className="medicine-retail-count">
                  {medicine.retailProducts?.length || 0} retail {(medicine.retailProducts?.length || 0) === 1 ? "product" : "products"}
                </span>
                <div className="medicine-retail-products">
                  {(medicine.retailProducts || []).filter((product) => product.market === "IN").map((product, index) => (
                    <section className="medicine-retail-product" key={`${product.brand}-${product.strength}-${product.packSize}-${index}`}>
                      <strong>{product.brand} · {product.strength}</strong>
                      <span>{product.form} · {product.packSize}</span>
                      {product.manufacturer && <small>Manufacturer: {product.manufacturer}</small>}
                      <MedicineRetailPrice medicine={medicine} product={product} />
                      <div className="medicine-retail-sources">
                        {product.sources.map((source) => (
                          <a
                            key={`${source.retailer}-${source.url}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.retailer}
                          </a>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="medicine-safety-note">
          <ShieldCheck size={18} />
          <p>Product details and source links are provided for reference and may change. Verify the product and availability with the retailer. Vitalia does not recommend medicines or doses; follow a clinician’s advice.</p>
        </div>
      </section>

      <section className="patient-feature-card medicine-order-help">
        <div>
          <span className="patient-feature-kicker">NEED HELP?</span>
          <h2>Questions about a medicine?</h2>
          <p>The catalogue does not place orders. Message the care team to ask about availability or ordering.</p>
        </div>
        <Link className="patient-feature-button patient-feature-button-secondary" to="/messages">
          Message support <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

export function PatientMessages({ user }) {
  const [form, setForm] = useState({ subject: "", message: "" });
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState("");
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  useEffect(() => {
    let active = true;

    async function loadMessages() {
      try {
        const data = await fetchMySupportConversations();
        if (active) {
          setConversations(data);
          setSelectedId((current) => data.some((conversation) => conversation.id === current)
            ? current
            : data[0]?.id || "");
          setMessagesError("");
        }
      } catch (requestError) {
        if (active) setMessagesError(requestError.message);
      } finally {
        if (active) setLoadingMessages(false);
      }
    }

    loadMessages();
    const timer = window.setInterval(loadMessages, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
    setSent(false);
  }

  async function submitMessage(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    setSent(false);
    try {
      const { conversation } = await sendSupportMessage(form);
      setForm({ subject: "", message: "" });
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setSelectedId(conversation.id);
      setSent(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    if (!selectedConversation || !reply.trim()) return;
    setSending(true);
    setMessagesError("");
    try {
      const updated = await replyToSupportConversation(selectedConversation.id, reply);
      setConversations((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
      setReply("");
    } catch (requestError) {
      setMessagesError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="patient-feature-page">
      <header className="patient-feature-heading">
        <span className="eyebrow">WE’RE HERE TO HELP</span>
        <h1>Message support.</h1>
        <p>Message the Vitalia team and follow replies here. Your account email is {user?.email || "available in your profile"}.</p>
      </header>

      <div className="patient-message-layout">
        <div className="patient-message-main">
          <section className="patient-feature-card patient-conversation-card">
            <div className="patient-feature-card-heading">
              <span className="patient-feature-icon"><MessageCircle size={21} /></span>
              <div><h2>Your support messages</h2><p>Replies from the Vitalia team appear here.</p></div>
            </div>
            {messagesError && <p className="patient-form-message patient-form-error" role="alert">{messagesError}</p>}
            {loadingMessages ? <p className="patient-message-empty">Loading your conversations…</p> : conversations.length ? (
              <div className="patient-conversation-list">
                {conversations.map((conversation) => (
                  <button
                    className={`patient-conversation-item${conversation.id === selectedId ? " patient-conversation-item-active" : ""}`}
                    type="button"
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <span><strong>{conversation.subject}</strong><small>{new Date(conversation.lastMessageAt).toLocaleString()}</small></span>
                    <small className={`patient-conversation-status patient-conversation-status-${conversation.status}`}>{conversation.status.replaceAll("_", " ")}</small>
                  </button>
                ))}
              </div>
            ) : <p className="patient-message-empty">You haven’t messaged support yet.</p>}

            {selectedConversation && (
              <div className="patient-conversation-thread">
                <h3>{selectedConversation.subject}</h3>
                <div className="patient-thread-messages">
                  {selectedConversation.messages.map((item) => (
                    <article className={`patient-thread-message patient-thread-message-${item.senderRole}`} key={item._id || item.id || `${item.createdAt}-${item.senderRole}`}>
                      <div><strong>{item.senderRole === "admin" ? "Vitalia Support" : item.senderName || "You"}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
                {selectedConversation.status !== "closed" ? (
                  <form className="patient-thread-reply" onSubmit={submitReply}>
                    <label className="patient-form-field" htmlFor="support-reply">Reply to support</label>
                    <textarea id="support-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={3000} rows={3} placeholder="Write a reply..." required />
                    <button className="patient-feature-button" type="submit" disabled={sending || !reply.trim()}><Mail size={15} /> {sending ? "Sending…" : "Send reply"}</button>
                  </form>
                ) : <p className="patient-message-empty">This conversation is closed. Send a new message if you need more help.</p>}
              </div>
            )}
          </section>

          <form className="patient-feature-card patient-message-form" onSubmit={submitMessage}>
            <div className="patient-feature-card-heading">
              <span className="patient-feature-icon"><Mail size={20} /></span>
              <div><h2>Start a new message</h2><p>For your privacy, don’t include passwords or urgent medical details.</p></div>
            </div>
            <label className="patient-form-field">
              Subject
              <input name="subject" value={form.subject} onChange={updateField} maxLength={100} placeholder="How can we help?" required />
            </label>
            <label className="patient-form-field">
              Message
              <textarea name="message" value={form.message} onChange={updateField} minLength={10} maxLength={3000} rows={5} placeholder="Tell us what you need help with..." required />
              <span className="patient-field-counter">{form.message.length}/3000</span>
            </label>
            {error && <p className="patient-form-message patient-form-error" role="alert">{error}</p>}
            {sent && <p className="patient-form-message patient-form-success" role="status"><CheckCircle2 size={17} /> Your message was sent to Vitalia support.</p>}
            <button className="patient-feature-button" type="submit" disabled={sending}><Mail size={16} /> {sending ? "Sending message…" : "Send message"}</button>
          </form>
        </div>

        <aside className="patient-feature-card patient-support-aside">
          <span className="patient-feature-icon"><CircleHelp size={21} /></span>
          <h2>Need a quick answer?</h2>
          <p>Check common questions about bookings, reports, and account settings.</p>
          <Link className="patient-feature-text-link" to="/help">Visit Help <ArrowRight size={15} /></Link>
          <div className="patient-support-note">
            <ShieldCheck size={17} />
            <span>This inbox is for portal support. For urgent medical concerns, contact a healthcare professional directly.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function PatientSettings({ user, onUserUpdated }) {
  const [form, setForm] = useState(() => getProfileForm(user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const originalForm = useMemo(() => getProfileForm(user), [user]);
  const hasChanges = Object.keys(emptyProfile).some(
    (field) => form[field] !== originalForm[field]
  );

  const profileSections = useMemo(() => [
    { title: "Personal information", icon: UserRound, fields: ["fullName", "dateOfBirth", "gender", "phone", "address"] },
    { title: "Care preferences", icon: HeartPulse, fields: ["preferredLocation", "homeCollection"] },
    { title: "Emergency contact", icon: ShieldCheck, fields: ["emergencyName", "emergencyPhone", "relationship"] },
  ], []);

  function updateField(event) {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setError("");
    setSaved(false);
  }

  async function submitSettings(event) {
    event.preventDefault();
    if (!hasChanges) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updatedUser = await saveUserProfile(form);
      onUserUpdated(updatedUser);
      setForm(getProfileForm(updatedUser));
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function renderField(field) {
    if (field === "homeCollection") {
      return (
        <label className="patient-setting-toggle" htmlFor={field} key={field}>
          <span><strong>Prefer home collection</strong><small>Choose home collection when it’s available for a diagnostic.</small></span>
          <input id={field} name={field} type="checkbox" checked={form.homeCollection} onChange={updateField} />
        </label>
      );
    }

    const fieldInfo = {
      fullName: { label: "Full name", type: "text", required: true, autoComplete: "name" },
      dateOfBirth: { label: "Date of birth", type: "date", required: true },
      gender: { label: "Gender", type: "select", required: true },
      phone: { label: "Mobile number", type: "tel", required: true, autoComplete: "tel-national", maxLength: 10 },
      address: { label: "Address", type: "textarea", required: true, rows: 3 },
      preferredLocation: { label: "Preferred city or area", type: "text", autoComplete: "address-level2" },
      emergencyName: { label: "Emergency contact name", type: "text", required: true },
      emergencyPhone: { label: "Emergency contact number", type: "tel", required: true, maxLength: 10 },
      relationship: { label: "Relationship", type: "select", required: true },
    }[field];
    if (!fieldInfo) return null;

    const commonProps = {
      id: field,
      name: field,
      value: form[field],
      onChange: updateField,
      required: fieldInfo.required,
      autoComplete: fieldInfo.autoComplete,
      maxLength: fieldInfo.maxLength,
    };

    return (
      <label className={`patient-form-field patient-setting-field patient-setting-${field}`} key={field} htmlFor={field}>
        {fieldInfo.label}
        {fieldInfo.type === "textarea" ? (
          <textarea {...commonProps} rows={fieldInfo.rows} />
        ) : fieldInfo.type === "select" ? (
          <select {...commonProps}>
            {field === "gender" ? (
              <>
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </>
            ) : (
              <>
                <option value="">Select relationship</option>
                <option value="parent">Parent</option>
                <option value="spouse">Spouse</option>
                <option value="sibling">Sibling</option>
                <option value="friend">Friend</option>
                <option value="other">Other</option>
              </>
            )}
          </select>
        ) : (
          <input {...commonProps} type={fieldInfo.type} max={field === "dateOfBirth" ? new Date().toISOString().slice(0, 10) : undefined} />
        )}
      </label>
    );
  }

  return (
    <div className="patient-feature-page">
      <header className="patient-feature-heading">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h1>Settings.</h1>
        <p>Keep your profile and care preferences up to date.</p>
      </header>

      <form className="patient-settings-form" onSubmit={submitSettings}>
        {profileSections.map(({ title, icon: Icon, fields }) => (
          <section className="patient-feature-card patient-settings-section" key={title}>
            <div className="patient-feature-card-heading">
              <span className="patient-feature-icon"><Icon size={20} /></span>
              <div><h2>{title}</h2></div>
            </div>
            {title === "Personal information" && (
              <div className="patient-account-email">
                <span>Email address</span><strong>{user?.email}</strong>
              </div>
            )}
            <div className={`patient-settings-fields patient-settings-fields-${fields.length}`}>
              {fields.map(renderField)}
            </div>
          </section>
        ))}
        {error && <p className="patient-form-message patient-form-error" role="alert">{error}</p>}
        {saved && <p className="patient-form-message patient-form-success" role="status"><CheckCircle2 size={17} /> Your profile settings are saved.</p>}
        <div className="patient-settings-actions">
          <Link className="patient-feature-button patient-feature-button-secondary" to="/homepage">Cancel</Link>
          <button className="patient-feature-button" type="submit" disabled={saving || !hasChanges}>{saving ? "Saving changes…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

const helpTopics = [
  {
    title: "How do I book a diagnostic test?",
    answer: <>Browse <Link to="/tests">Lab Test</Link>, choose a diagnostic, then select an available center and appointment time. Your booking appears under <Link to="/bookings">Appointment</Link>.</>,
  },
  {
    title: "Where can I see my appointment details?",
    answer: <>Open <Link to="/bookings">Appointment</Link> to review booking dates, center details, payment status, and any available actions.</>,
  },
  {
    title: "How do I access a medical report?",
    answer: <>Reports shared with your account are listed under <Link to="/reports">Documents</Link>. Some reports are available for one download only, so save the file securely.</>,
  },
  {
    title: "How can I update my profile or care preferences?",
    answer: <>Open <Link to="/settings">Setting</Link> to update your contact details, preferred area, home-collection preference, and emergency contact.</>,
  },
  {
    title: "Can I order medicines from Vitalia?",
    answer: <>Browse the <Link to="/medicine-order">Medicine Order</Link> catalogue to check listed medicines, prices, and stock. The portal does not place orders; <Link to="/messages">message support</Link> to ask about availability or ordering.</>,
  },
];

export function PatientHelp() {
  return (
    <div className="patient-feature-page">
      <header className="patient-feature-heading">
        <span className="eyebrow">PATIENT SUPPORT</span>
        <h1>Help.</h1>
        <p>Find answers to common questions about your Vitalia portal.</p>
      </header>

      <section className="patient-feature-card patient-help-card">
        <div className="patient-feature-card-heading">
          <span className="patient-feature-icon"><CircleHelp size={21} /></span>
          <div><h2>Frequently asked questions</h2><p>Quick guidance for using your portal.</p></div>
        </div>
        <div className="patient-help-list">
          {helpTopics.map(({ title, answer }) => (
            <details className="patient-help-item" key={title}>
              <summary>{title}<span>+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="patient-feature-card patient-help-contact">
        <div>
          <span className="patient-feature-icon"><MessageCircle size={20} /></span>
          <h2>Still need help?</h2>
          <p>Send a message to the Vitalia support team.</p>
        </div>
        <Link className="patient-feature-button" to="/messages">Message support <ArrowRight size={15} /></Link>
      </section>

      <p className="patient-help-emergency"><MapPin size={15} /> This portal is not for medical emergencies. Contact local emergency services or a healthcare professional for urgent care.</p>
      <span className="patient-help-records"><FileText size={13} /> Your account information is managed securely through your profile settings.</span>
    </div>
  );
}
