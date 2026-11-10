import { Activity, ArrowDown, ArrowRight, HeartHandshake, Microscope, ShieldCheck, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";
import { getRoleHomePath } from "../services/permissions.js";

const careSteps = [
  {
    number: "01",
    icon: <Microscope size={21} />,
    title: "Explore diagnostics",
    description: "Browse the diagnostic services and centers available through your Vitalia portal.",
  },
  {
    number: "02",
    icon: <HeartHandshake size={21} />,
    title: "Coordinate your visit",
    description: "Request a booking, review its status, and keep the details together in one place.",
  },
  {
    number: "03",
    icon: <ShieldCheck size={21} />,
    title: "Stay connected",
    description: "Find reports shared with you and return to your booking information when you need it.",
  },
];

function AboutUs({ user }) {
  const workspacePath = user ? getRoleHomePath(user) : "";

  return (
    <div className="about-page">
      <header className="about-header">
        <Link className="about-brand" to="/about" aria-label="Vitalia About us">
          <span className="about-brand-mark"><Activity size={21} /></span>
          <span>VITALIA<span className="about-brand-dot">.</span></span>
        </Link>
        <nav className="about-nav" aria-label="Main navigation">
          <a href="#our-purpose">Our purpose</a>
          <a href="#how-it-works">How it works</a>
          <Link to="/privacy">Privacy</Link>
        </nav>
        <div className="about-header-actions">
          {user ? (
            <Link className="about-signin" to={workspacePath}>Your workspace</Link>
          ) : (
            <>
              <Link className="about-signin" to="/login">Sign in</Link>
              <Link className="about-register" to="/register">Create account <ArrowRight size={15} /></Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="about-hero">
          <div className="about-hero-copy">
            <span className="about-eyebrow"><span /> DIAGNOSTICS, MADE EASIER TO NAVIGATE</span>
            <h1>A clearer path through your <span>health journey.</span></h1>
            <p>
              Vitalia brings diagnostic services, bookings, and shared reports
              together in one thoughtful place—so it is easier to stay informed
              and organized along the way.
            </p>
            <div className="about-hero-actions">
              <Link className="about-primary-button" to={user ? workspacePath : "/register"}>
                {user ? "Go to your workspace" : "Get started"} <ArrowRight size={17} />
              </Link>
              <a className="about-text-link" href="#our-purpose">Discover Vitalia <ArrowDown size={15} /></a>
            </div>
            <div className="about-trust-note">
              <ShieldCheck size={17} />
              <span>Designed to help keep your care details organized.</span>
            </div>
          </div>

          <div className="about-hero-art" aria-label="Illustration representing connected diagnostic care">
            <div className="about-art-orbit about-art-orbit-one" />
            <div className="about-art-orbit about-art-orbit-two" />
            <div className="about-art-center">
              <span className="about-art-icon"><Activity size={37} /></span>
              <strong>Care, connected.</strong>
              <span>One place for your next steps</span>
            </div>
            <div className="about-art-card about-art-card-top">
              <span className="about-art-card-icon"><Stethoscope size={17} /></span>
              <span><strong>Diagnostic care</strong><small>Explore available services</small></span>
              <span className="about-art-status" />
            </div>
            <div className="about-art-card about-art-card-bottom">
              <span className="about-art-card-icon about-art-report-icon"><ShieldCheck size={17} /></span>
              <span><strong>Your information</strong><small>Access through your account</small></span>
            </div>
            <span className="about-art-spark about-art-spark-one">✳</span>
            <span className="about-art-spark about-art-spark-two">✦</span>
          </div>
          <a className="about-scroll-cue" href="#our-purpose" aria-label="Scroll to our purpose">
            <ArrowDown size={16} />
          </a>
        </section>

        <section className="about-purpose" id="our-purpose">
          <div className="about-section-heading">
            <span className="about-eyebrow">WHY VITALIA</span>
            <h2>Care coordination should feel <span>clear and human.</span></h2>
          </div>
          <div className="about-purpose-copy">
            <p>
              Finding a service, keeping track of a booking, and locating a
              report can involve a lot of separate steps. Vitalia is built to
              bring those practical parts of diagnostic care into a single
              accessible portal.
            </p>
            <p>
              We focus on useful information and straightforward tools, while
              leaving diagnosis and medical guidance where they belong: with
              qualified healthcare professionals.
            </p>
          </div>
        </section>

        <section className="about-how" id="how-it-works">
          <div className="about-how-heading">
            <div>
              <span className="about-eyebrow">A MORE ORGANIZED EXPERIENCE</span>
              <h2>Simple steps. Better visibility.</h2>
            </div>
            <p>Your portal keeps the essentials close, from exploring services to accessing information shared with you.</p>
          </div>
          <div className="about-steps">
            {careSteps.map((step) => (
              <article className="about-step" key={step.number}>
                <div className="about-step-top">
                  <span className="about-step-icon">{step.icon}</span>
                  <span className="about-step-number">{step.number}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-cta">
          <div className="about-cta-icon"><Activity size={22} /></div>
          <div>
            <span className="about-eyebrow">YOUR NEXT STEP</span>
            <h2>Keep your diagnostic journey in view.</h2>
            <p>Create an account to explore services and manage your care details through Vitalia.</p>
          </div>
          <Link className="about-cta-button" to={user ? workspacePath : "/login"}>
            {user ? "Open workspace" : "Book Now"} <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <footer className="about-footer">
        <Link className="about-brand" to="/about">
          <span className="about-brand-mark"><Activity size={18} /></span>
          <span>VITALIA<span className="about-brand-dot">.</span></span>
        </Link>
        <p>Your health journey, thoughtfully connected.</p>
        <nav aria-label="Legal links">
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of service</Link>
          {!user && <Link to="/login">Sign in</Link>}
        </nav>
        <span className="about-footer-copyright">© {new Date().getFullYear()} Vitalia</span>
      </footer>
    </div>
  );
}

export default AboutUs;
