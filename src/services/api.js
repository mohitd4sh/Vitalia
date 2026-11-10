
const TOKEN_KEY = "vitaliaToken";
const USER_KEY = "vitaliaUser";
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

export function storeSession(token, user) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("vitalia:session-expired"));
}

async function apiFetch(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const isMultipart = typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function readError(response) {
  const responseBody = await response.text();

  if (!responseBody) {
    return new Error(`Request failed (${response.status})`);
  }

  try {
    const data = JSON.parse(responseBody);
    return new Error(data.message || `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

function getActionNotification(path, method) {
  const pathname = path.split("?")[0];
  const actionRules = [
    [/^\/api\/profile$/, "Profile updated"],
    [/^\/api\/bookings\/[^/]+\/payment\/method$/, "Payment method selected"],
    [/^\/api\/bookings\/[^/]+\/payment\/confirm$/, "Payment confirmed"],
    [/^\/api\/bookings\/[^/]+\/status$/, "Booking status updated"],
    [/^\/api\/bookings\/[^/]+$/, method === "DELETE" ? "Booking cancelled" : null],
    [/^\/api\/bookings$/, method === "POST" ? "Booking requested" : null],
    [/^\/api\/reports$/, method === "POST" ? "Medical report sent" : null],
    [/^\/api\/tests\/[^/]+$/, method === "PUT" ? "Diagnostic test updated" : method === "DELETE" ? "Diagnostic test archived" : null],
    [/^\/api\/tests$/, method === "POST" ? "Diagnostic test added" : null],
    [/^\/api\/operations\/accounts\/[^/]+\/role$/, "Account access updated"],
    [/^\/api\/operations\/roles\/[^/]+$/, method === "PATCH" ? "Role permissions updated" : method === "DELETE" ? "Custom role deleted" : null],
    [/^\/api\/operations\/roles$/, method === "POST" ? "Custom role created" : null],
    [/^\/api\/operations\/staff\/[^/]+$/, "Staff details updated"],
    [/^\/api\/operations\/staff$/, method === "POST" ? "Staff member added" : null],
    [/^\/api\/operations\/centers\/[^/]+$/, method === "PUT" ? "Center details updated" : method === "DELETE" ? "Center deactivated" : null],
    [/^\/api\/operations\/centers$/, method === "POST" ? "Diagnostic center created" : null],
    [/^\/api\/operations\/inventory\/[^/]+$/, method === "PUT" ? "Inventory item updated" : method === "DELETE" ? "Inventory item removed" : null],
    [/^\/api\/operations\/inventory$/, method === "POST" ? "Inventory item added" : null],
    [/^\/api\/operations\/settings$/, method === "PUT" ? "Center settings updated" : null],
    [/^\/api\/coupons\/[^/]+$/, method === "PATCH" ? "Discount updated" : method === "DELETE" ? "Discount deactivated" : null],
    [/^\/api\/coupons$/, method === "POST" ? "Discount created" : null],
  ];
  return actionRules.find(([pattern, action]) => action && pattern.test(pathname))?.[1] || null;
}

async function saveActionNotification(action) {
  try {
    const response = await apiFetch("/api/notifications/message", {
      method: "POST",
      body: JSON.stringify({
        title: action,
        message: action,
        severity: "info",
      }),
    });
    if (!response.ok) {
      throw await readError(response);
    }
    window.dispatchEvent(new Event("vitalia:notifications-updated"));
  } catch (error) {
    console.warn("Unable to record action notification:", error.message);
  }
}

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const action = getActionNotification(path, method);
  const shouldNotify = action && Boolean(sessionStorage.getItem(TOKEN_KEY));
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const error = await readError(response);
    if (response.status === 401 && sessionStorage.getItem(TOKEN_KEY)) {
      clearSession();
    }
    throw error;
  }

  const responseBody = await response.text();

  if (!responseBody) {
    if (shouldNotify) void saveActionNotification(action);
    return {};
  }

  try {
    const data = JSON.parse(responseBody);
    if (shouldNotify) void saveActionNotification(action);
    return data;
  } catch {
    throw new Error("The server returned an invalid response.");
  }
}

async function apiBlob(path) {
  const response = await apiFetch(path);

  if (!response.ok) {
    if (response.status === 401 && sessionStorage.getItem(TOKEN_KEY)) {
      clearSession();
    }

    throw await readError(response);
  }

  return response.blob();
}

async function authenticate(path, credentials) {
  const data = await apiRequest(path, {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  if (!data.token || !data.user) {
    throw new Error("The server returned an invalid authentication response.");
  }

  storeSession(data.token, data.user);
  return data.user;
}

export function registerUser({ name, email, password }) {
  return authenticate("/api/auth/register", {
    name,
    email,
    password,
  });
}

export function loginUser({ email, password }) {
  return authenticate("/api/auth/login", {
    email,
    password,
  });
}

export async function requestPasswordChange({ email, method }) {
  return apiRequest("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email, method }),
  });
}

export async function completePasswordChange({ token, password }) {
  return apiRequest("/api/auth/password-reset/complete", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchPasswordChangeStatus(token) {
  return apiRequest("/api/auth/password-reset/status", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function fetchPasswordChangeRequests() {
  const data = await apiRequest("/api/auth/password-reset/requests");
  return data.requests;
}

export async function approvePasswordChangeRequest(id) {
  return apiRequest(`/api/auth/password-reset/requests/${id}/approve`, {
    method: "PATCH",
  });
}

export async function fetchCurrentUser() {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) return null;

  try {
    const data = await apiRequest("/api/auth/me");
    const user = data.user;

    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch (error) {
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      return null;
    }

    throw error;
  }
}

export async function fetchUserProfile() {
  const data = await apiRequest("/api/profile");
  return data.user;
}

export async function saveUserProfile(profile) {
  const normalizedProfile = {
    ...profile,
    gender: profile.gender === "prefer-not-to-say"
      ? "prefer_not_to_say"
      : profile.gender,
    homeCollection: profile.homeCollection === true || profile.homeCollection === "yes",
  };

  const data = await apiRequest("/api/profile", {
    method: "PUT",
    body: JSON.stringify(normalizedProfile),
  });

  if (data.user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }

  return data.user;
}

export async function sendSupportMessage({ subject, message }) {
  return apiRequest("/api/support/messages", {
    method: "POST",
    body: JSON.stringify({ subject, message }),
  });
}

export async function fetchMySupportConversations() {
  const data = await apiRequest("/api/support/mine");
  return data.conversations;
}

export async function fetchAdminSupportConversations() {
  const data = await apiRequest("/api/support/admin");
  return data.conversations;
}

export async function replyToSupportConversation(id, message) {
  const data = await apiRequest(`/api/support/messages/${encodeURIComponent(id)}/replies`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  return data.conversation;
}

export async function closeSupportConversation(id) {
  const data = await apiRequest(`/api/support/messages/${encodeURIComponent(id)}/close`, {
    method: "PATCH",
  });
  return data.conversation;
}

export async function fetchMedicines(query = "") {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const data = await apiRequest(`/api/medicines${search}`);
  return data.medicines;
}

export async function fetchManagedMedicines() {
  const data = await apiRequest("/api/medicines/admin");
  return data.medicines;
}

export async function saveMedicine(medicine) {
  const id = medicine.id;
  const data = await apiRequest(id ? `/api/medicines/${encodeURIComponent(id)}` : "/api/medicines", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify({
      name: medicine.name,
      brand: medicine.brand,
      strength: medicine.strength,
      form: medicine.form,
      category: medicine.category,
      description: medicine.description,
      price: medicine.price,
      mrp: medicine.mrp,
      discountPrice: medicine.discountPrice,
      stock: medicine.stock,
      requiresPrescription: medicine.requiresPrescription,
      active: medicine.active,
      retailProducts: medicine.retailProducts,
    }),
  });
  return data.medicine;
}

export async function deleteMedicine(id) {
  return apiRequest(`/api/medicines/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminUsers() {
  return apiRequest("/api/operations/patients");
}

export async function uploadPatientReport(formData) {
  return apiRequest("/api/reports", {
    method: "POST",
    body: formData,
  });
}

export async function fetchUserReports() {
  const data = await apiRequest("/api/reports");
  return data.reports;
}

export function downloadPatientReport(reportId) {
  return apiBlob(`/api/reports/${encodeURIComponent(reportId)}/download`);
}

export async function fetchDiagnosticTests() {
  const data = await apiRequest("/api/tests");
  return data.tests;
}

export async function saveDiagnosticTest(test) {
  const fields = {
    name: test.name,
    category: test.category,
    description: test.description,
    price: test.price,
    turnaround: test.turnaround,
    homeCollection: test.homeCollection,
    centers: test.centers,
    allCenters: test.allCenters,
    active: test.active,
  };
  const id = test.id;
  const data = await apiRequest(id ? `/api/tests/${id}` : "/api/tests", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(fields),
  });
  return data.test;
}

export async function archiveDiagnosticTest(id) {
  return apiRequest(`/api/tests/${id}`, { method: "DELETE" });
}

export async function reactivateDiagnosticTest(id) {
  return apiRequest(`/api/tests/${id}/reactivate`, { method: "PATCH" });
}

export async function fetchCenters() {
  const data = await apiRequest("/api/centers");
  return data.centers;
}

export async function createBooking(booking) {
  const data = await apiRequest("/api/bookings", {
    method: "POST",
    body: JSON.stringify(booking),
  });
  return data.booking;
}

export async function validateCoupon({ code, testId, centerId }) {
  return apiRequest("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code, testId, centerId }),
  });
}

export async function fetchCoupons() {
  const data = await apiRequest("/api/coupons");
  return data.coupons;
}

export async function saveCoupon(coupon) {
  const { id, ...fields } = coupon;
  const data = await apiRequest(id ? `/api/coupons/${id}` : "/api/coupons", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(fields),
  });
  return data.coupon;
}

export async function deactivateCoupon(id) {
  const data = await apiRequest(`/api/coupons/${id}`, { method: "DELETE" });
  return data.coupon;
}

export async function fetchBookings({ mine = false, status = "all" } = {}) {
  const path = mine
    ? "/api/bookings/mine"
    : `/api/bookings?status=${encodeURIComponent(status)}`;
  const data = await apiRequest(path);
  return data.bookings;
}

export async function fetchNotifications() {
  return apiRequest("/api/notifications");
}

export async function markNotificationRead(id) {
  return apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  return apiRequest("/api/notifications/read-all", { method: "PATCH" });
}

export async function updateBookingStatus(id, status, notes = "") {
  const data = await apiRequest(`/api/bookings/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
  return data.booking;
}

export async function cancelBooking(id) {
  const data = await apiRequest(`/api/bookings/${id}`, { method: "DELETE" });
  return data.booking;
}

export async function chooseBookingPaymentMethod(bookingId, method) {
  const data = await apiRequest(`/api/bookings/${bookingId}/payment/method`, {
    method: "POST",
    body: JSON.stringify({ method }),
  });
  return data.payment;
}

export async function fetchPaymentInfo(centerId = "") {
  const query = centerId ? `?centerId=${encodeURIComponent(centerId)}` : "";
  return apiRequest(`/api/centers/payment-info${query}`);
}

export async function confirmManualPayment(bookingId) {
  const data = await apiRequest(`/api/bookings/${bookingId}/payment/confirm`, {
    method: "PATCH",
  });
  return data.booking;
}

export async function fetchOperationsOverview({ period = "week" } = {}) {
  return apiRequest(`/api/operations/overview?period=${encodeURIComponent(period)}`);
}

export async function fetchPatients() {
  const data = await apiRequest("/api/operations/patients");
  return data.patients;
}

export async function fetchReportRecipients() {
  return apiRequest("/api/reports/patients");
}

export async function fetchStaff() {
  const data = await apiRequest("/api/operations/staff");
  return data.staff;
}

export async function fetchManagedAccounts() {
  const data = await apiRequest("/api/operations/accounts");
  return data.accounts;
}

export async function fetchRoleCatalog() {
  return apiRequest("/api/operations/roles");
}

export async function createCustomRole(role) {
  const data = await apiRequest("/api/operations/roles", {
    method: "POST",
    body: JSON.stringify(role),
  });
  return data.role;
}

export async function updateCustomRole(id, role) {
  const data = await apiRequest(`/api/operations/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(role),
  });
  return data.role;
}

export async function updateBuiltInRole(role, permissions) {
  const data = await apiRequest(`/api/operations/roles/builtin/${role}`, {
    method: "PATCH",
    body: JSON.stringify({ permissions }),
  });
  return data.builtInRole;
}

export async function deleteCustomRole(id) {
  return apiRequest(`/api/operations/roles/${id}`, { method: "DELETE" });
}

export async function updateAccountRole(id, update) {
  const data = await apiRequest(`/api/operations/accounts/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return data.account;
}

export async function createStaffMember(member) {
  const data = await apiRequest("/api/operations/staff", {
    method: "POST",
    body: JSON.stringify(member),
  });
  return data.staff;
}

export async function updateStaffMember(id, update) {
  const data = await apiRequest(`/api/operations/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  return data.staff;
}

export async function fetchManagedCenters() {
  const data = await apiRequest("/api/operations/centers");
  return data.centers;
}

export async function saveCenter(center) {
  const { id, ...centerFields } = center;
  const fields = {
    name: centerFields.name,
    code: centerFields.code,
    address: centerFields.address,
    city: centerFields.city,
    phone: centerFields.phone,
    openingHours: centerFields.openingHours,
    active: centerFields.active,
    ...(centerFields.centerMaster ? { centerMaster: centerFields.centerMaster } : {}),
  };
  const data = await apiRequest(
    id ? `/api/operations/centers/${id}` : "/api/operations/centers",
    { method: id ? "PUT" : "POST", body: JSON.stringify(fields) }
  );
  return data.center;
}

export async function deleteCenter(id) {
  return apiRequest(`/api/operations/centers/${id}`, { method: "DELETE" });
}

export async function fetchInventory() {
  const data = await apiRequest("/api/operations/inventory");
  return data.items;
}

export async function saveInventoryItem(item) {
  const fields = {
    name: item.name,
    sku: item.sku,
    category: item.category,
    quantity: item.quantity,
    reorderLevel: item.reorderLevel,
    unit: item.unit,
    center: item.center,
    expiresAt: item.expiresAt,
  };
  const id = item.id;
  const data = await apiRequest(
    id ? `/api/operations/inventory/${id}` : "/api/operations/inventory",
    { method: id ? "PUT" : "POST", body: JSON.stringify(fields) }
  );
  return data.item;
}

export async function deleteInventoryItem(id) {
  return apiRequest(`/api/operations/inventory/${id}`, { method: "DELETE" });
}

export async function fetchCenterSettings(centerId = "") {
  const query = centerId ? `?centerId=${encodeURIComponent(centerId)}` : "";
  const data = await apiRequest(`/api/operations/settings${query}`);
  return data.settings;
}

export async function saveCenterSettings(settings, centerId = "") {
  const data = await apiRequest("/api/operations/settings", {
    method: "PUT",
    body: JSON.stringify({
      name: settings.name,
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      timezone: settings.timezone,
      upiId: settings.upiId,
      ...(centerId ? { centerId } : {}),
    }),
  });
  return data.settings;
}

export async function fetchBillingRecords() {
  const data = await apiRequest("/api/operations/billing");
  return data.payments;
}
