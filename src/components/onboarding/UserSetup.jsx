
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserRound,
  HeartPulse,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Check,
  Activity,
} from "lucide-react";

import { getStoredUser, saveUserProfile } from "../../services/api.js";
import "./UserSetup.css";

const steps = [
  { title: "Personal details", icon: UserRound },
  { title: "Health preferences", icon: HeartPulse },
  { title: "Emergency contact", icon: ShieldCheck },
];

const initialForm = {
  fullName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  address: "",
  preferredLocation: "",
  emergencyName: "",
  emergencyPhone: "",
  relationship: "",
};

function UserSetup({ onProfileSaved }) {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => ({
    ...initialForm,
    fullName: user?.name || "",
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
  };

  const validateStep = () => {
    if (step === 0) {
      if (!form.fullName.trim()) return "Please enter your full name.";
      if (!form.dateOfBirth) return "Please select your date of birth.";
      if (!form.gender) return "Please select your gender.";
      if (!/^[6-9]\d{9}$/.test(form.phone.trim())) {
        return "Enter a valid 10-digit Indian mobile number.";
      }
      if (!form.address.trim()) return "Please enter your address.";
    }

    if (step === 1 && !form.preferredLocation.trim()) {
      return "Please enter your preferred city or area.";
    }

    if (step === 2) {
      if (!form.emergencyName.trim()) {
        return "Please enter your emergency contact's name.";
      }
      if (!/^[6-9]\d{9}$/.test(form.emergencyPhone.trim())) {
        return "Enter a valid 10-digit emergency contact number.";
      }
      if (!form.relationship) {
        return "Please select your relationship with this contact.";
      }
    }

    return "";
  };

  const handleNext = () => {
    const validationError = validateStep();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateStep();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user?.email) {
      setError("Your login session has expired. Please log in again.");
      return;
    }

    try {
      setSaving(true);
      const updatedUser = await saveUserProfile({ ...form, homeCollection: false });
      onProfileSaved(updatedUser);
      navigate("/homepage", { replace: true });
    } catch (saveError) {
      setError(saveError.message || "We couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="setup-page">
      <aside className="setup-aside">
        <div className="setup-brand">
          <span className="setup-brand-icon">
            <Activity size={25} />
          </span>
          <span>VITALIA</span>
        </div>

        <div className="setup-aside-content">
          <span className="setup-eyebrow">YOUR HEALTH, SIMPLIFIED</span>
          <h1>Care starts with getting to know you.</h1>
          <p>
            Set up your profile to make diagnostic bookings and managing
            your reports easier.
          </p>

          <div className="setup-benefit">
            <span><Check size={17} /></span>
            A more personalized experience
          </div>
          <div className="setup-benefit">
            <span><Check size={17} /></span>
            Your bookings in one place
          </div>
          <div className="setup-benefit">
            <span><Check size={17} /></span>
            Easier access to your reports
          </div>
        </div>

        <p className="setup-aside-footer">
          Your health journey, all in one place.
        </p>
      </aside>

      <main className="setup-main">
        <div className="setup-card">
          <div className="setup-mobile-brand">
            <Activity size={23} /> VITALIA
          </div>

          <div className="setup-heading">
            <span className="setup-step-label">
              STEP {step + 1} OF {steps.length}
            </span>
            <h2>Complete your profile</h2>
            <p>A few details will help us personalize your experience.</p>
          </div>

          <div className="setup-progress" aria-label="Setup progress">
            {steps.map((item, index) => {
              const Icon = item.icon;

              return (
                <div
                  className={`setup-progress-step ${
                    index <= step ? "is-active" : ""
                  } ${index < step ? "is-complete" : ""}`}
                  key={item.title}
                >
                  <span className="setup-progress-icon">
                    {index < step ? <Check size={17} /> : <Icon size={17} />}
                  </span>
                  <span className="setup-progress-title">{item.title}</span>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {step === 0 && (
              <section className="setup-fields">
                <div className="setup-section-title">
                  <h3>Personal information</h3>
                  <p>Tell us a little about yourself.</p>
                </div>

                <label className="setup-field">
                  Full name
                  <input
                    name="fullName"
                    value={form.fullName}
                    onChange={updateField}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />
                </label>

                <div className="setup-field-row">
                  <label className="setup-field">
                    Date of birth
                    <input
                      type="date"
                      name="dateOfBirth"
                      value={form.dateOfBirth}
                      onChange={updateField}
                      max={new Date().toISOString().split("T")[0]}
                      required
                    />
                  </label>

                  <label className="setup-field">
                    Gender
                    <select
                      name="gender"
                      value={form.gender}
                      onChange={updateField}
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </label>
                </div>

                <label className="setup-field">
                  Mobile number
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={updateField}
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="tel-national"
                    required
                  />
                </label>

                <label className="setup-field">
                  Address
                  <textarea
                    name="address"
                    value={form.address}
                    onChange={updateField}
                    placeholder="Enter your address"
                    rows={3}
                    required
                  />
                </label>
              </section>
            )}

            {step === 1 && (
              <section className="setup-fields">
                <div className="setup-section-title">
                  <h3>Your care preferences</h3>
                  <p>Help us make finding a diagnostic center easier.</p>
                </div>

                <label className="setup-field">
                  Preferred city or area
                  <input
                    name="preferredLocation"
                    value={form.preferredLocation}
                    onChange={updateField}
                    placeholder="e.g. Bhubaneswar"
                    autoComplete="address-level2"
                    required
                  />
                </label>

                <div className="setup-info-note">
                  <HeartPulse size={19} />
                  <p>
                    Choose center visit or home collection when you book a
                    diagnostic test. Home collection depends on availability
                    at the selected center.
                  </p>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="setup-fields">
                <div className="setup-section-title">
                  <h3>Emergency contact</h3>
                  <p>
                    Add someone we can contact if you need assistance.
                  </p>
                </div>

                <label className="setup-field">
                  Contact person's full name
                  <input
                    name="emergencyName"
                    value={form.emergencyName}
                    onChange={updateField}
                    placeholder="Enter their full name"
                    required
                  />
                </label>

                <label className="setup-field">
                  Contact mobile number
                  <input
                    type="tel"
                    name="emergencyPhone"
                    value={form.emergencyPhone}
                    onChange={updateField}
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    maxLength={10}
                    required
                  />
                </label>

                <label className="setup-field">
                  Relationship
                  <select
                    name="relationship"
                    value={form.relationship}
                    onChange={updateField}
                    required
                  >
                    <option value="">Select relationship</option>
                    <option value="parent">Parent</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <div className="setup-info-note">
                  <ShieldCheck size={19} />
                  <p>
                    Your emergency contact details will be stored with your
                    profile. Only provide information you have permission to share.
                  </p>
                </div>
              </section>
            )}

            {error && (
              <p className="setup-error" role="alert">
                {error}
              </p>
            )}

            <div className="setup-actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="setup-back-button"
                  onClick={handleBack}
                >
                  <ArrowLeft size={17} /> Back
                </button>
              ) : (
                <span />
              )}

              {step < steps.length - 1 ? (
                <button
                  type="button"
                  className="setup-next-button"
                  onClick={handleNext}
                >
                  Continue <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="setup-next-button"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Complete setup"}
                  {!saving && <Check size={17} />}
                </button>
              )}
            </div>

            <p className="setup-privacy-note">
              <ShieldCheck size={15} />
              Your information should be protected and handled securely.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

export default UserSetup;
