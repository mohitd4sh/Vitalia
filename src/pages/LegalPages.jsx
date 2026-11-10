import { Link } from "react-router-dom";
import { getRoleHomePath } from "../services/permissions.js";

function LegalPage({ title, description, user, children }) {
  const homePath = user ? getRoleHomePath(user) : "/about";

  return (
    <article className="content-page legal-page">
      <span className="eyebrow">VITALIA INFORMATION</span>
      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
      <div className="legal-page-body">{children}</div>
      <Link className="legal-page-back" to={homePath}>{user ? "Back to your workspace" : "Back to About Vitalia"}</Link>
    </article>
  );
}

export function PrivacyPolicy({ user }) {
  return (
    <LegalPage
      title="Privacy policy"
      description="How Vitalia handles information used to support diagnostic bookings and reports."
      user={user}
    >
      <section>
        <h2>Information used by Vitalia</h2>
        <p>
          Vitalia may process the account and profile details you provide, your
          diagnostic searches and bookings, payment status, and reports uploaded
          for a booking. Please only enter information needed to use the service.
        </p>
      </section>
      <section>
        <h2>How information is used</h2>
        <p>
          The application uses this information to manage accounts, coordinate
          bookings, support diagnostic-center operations, record payment
          confirmation, and make reports available to the relevant patient and
          authorized staff.
        </p>
      </section>
      <section>
        <h2>Storage and retention</h2>
        <p>
          Account and operational records are handled by the Vitalia service.
          Uploaded patient reports are temporarily held by the API: a report is
          removed after download or within seven days, and pending reports are
          lost if the API restarts. Do not use this temporary report storage as
          a permanent medical-record archive.
        </p>
      </section>
      <section>
        <h2>Browser storage and preferences</h2>
        <p>
          Vitalia stores your sign-in token in session storage and saves your
          cookie preferences in local storage. The current application does not
          use analytics cookies; the optional analytics preference is saved for
          your choice and does not activate an analytics service.
        </p>
      </section>
      <section>
        <h2>Your responsibility</h2>
        <p>
          Keep your sign-in details private and avoid sharing another person’s
          health information unless you are authorized to do so. Contact your
          diagnostic center directly for questions about its handling of your
          information.
        </p>
      </section>
    </LegalPage>
  );
}

export function TermsOfService({ user }) {
  return (
    <LegalPage
      title="Terms of service"
      description="Guidance for using the Vitalia diagnostic booking and report portal."
      user={user}
    >
      <section>
        <h2>Using the service</h2>
        <p>
          Vitalia provides tools to browse diagnostic services, request
          appointments, manage bookings, and access reports made available
          through the portal. Use the service lawfully and provide information
          that is accurate to the best of your knowledge.
        </p>
      </section>
      <section>
        <h2>Accounts and access</h2>
        <p>
          Keep your account credentials secure. Access to patient, staff, and
          administrative features is determined by the role assigned to your
          account. Notify your diagnostic center if you believe your account
          has been accessed without permission.
        </p>
      </section>
      <section>
        <h2>Bookings and payments</h2>
        <p>
          A booking request and its status are shown in the portal. UPI
          transfers and cash payments are not automatically verified; payment
          remains pending until authorized center staff confirm receipt.
          Contact the center for appointment availability, payment questions,
          or changes to a booking.
        </p>
      </section>
      <section>
        <h2>Reports and medical care</h2>
        <p>
          Vitalia is a coordination portal, not a medical provider, and the
          portal’s information is not a diagnosis or medical advice. Discuss
          test results and care decisions with a qualified healthcare
          professional. Reports may only be temporarily available in the
          application, so keep your own copy when appropriate.
        </p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>
          Features and information shown in the portal depend on the diagnostic
          center’s configuration and service availability. Contact the center
          directly if you need help with a service or booking.
        </p>
      </section>
    </LegalPage>
  );
}
