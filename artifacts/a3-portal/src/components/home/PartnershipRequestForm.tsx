import { useState } from "react";

const PARTNER_TYPES = [
  "Hotel or Resort",
  "Venue",
  "Event",
  "Toured Event",
  "Festival or Market",
  "Sports or Entertainment",
  "Agency or Producer",
  "Corporate Brand",
  "Retail or Pop-Up Program",
  "Other",
];

const USE_CASES = [
  "Public customer-facing portal",
  "Private password-protected portal",
  "Vendor or exhibitor ordering portal",
  "Internal event team portal",
  "Multi-location or toured event portal",
  "Not sure yet",
];

const VOLUMES = [
  "One-time event",
  "Recurring monthly",
  "Seasonal",
  "Annual event",
  "Multi-city or national program",
  "Ongoing partnership",
];

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  partnerType: string;
  portalUseCase: string;
  estimatedVolume: string;
  message: string;
}

const EMPTY: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  partnerType: "",
  portalUseCase: "",
  estimatedVolume: "",
  message: "",
};

const baseInput =
  "w-full bg-white border border-slate-300 rounded-md px-3.5 py-2.5 text-[15px] text-slate-900 " +
  "placeholder:text-slate-400 focus:outline-none focus:border-[#0E1B3D] focus:ring-2 focus:ring-[#0E1B3D]/20 " +
  "transition-colors";

const labelCls = "block text-[11px] font-bold uppercase tracking-[0.1em] text-[#0E1B3D] mb-1.5";

export function PartnershipRequestForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setStatus("error");
      setErrorMsg("Please fill in company, contact name, and email.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/public/partnership-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          partnerType: form.partnerType || null,
          portalUseCase: form.portalUseCase || null,
          estimatedVolume: form.estimatedVolume || null,
          message: form.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      setStatus("success");
      setForm(EMPTY);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 sm:p-10 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#E9B947]/20 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-[#0E1B3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold uppercase tracking-[0.04em] text-[#0E1B3D] mb-2">
          Request received
        </h3>
        <p className="text-slate-600 max-w-md mx-auto mb-6">
          Thanks — the A3 Visual team will review your request and follow up shortly to discuss the
          best portal structure for your organization.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="text-sm font-semibold text-[#0E1B3D] hover:text-[#C99A2E]"
        >
          Submit another request →
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-slate-200 rounded-lg p-6 sm:p-8 lg:p-10 shadow-sm"
      data-testid="partnership-request-form"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <div>
          <label className={labelCls}>Company or Organization *</label>
          <input
            type="text"
            required
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            className={baseInput}
            placeholder="Acme Hotels"
            data-testid="input-companyName"
          />
        </div>
        <div>
          <label className={labelCls}>Contact Name *</label>
          <input
            type="text"
            required
            value={form.contactName}
            onChange={(e) => update("contactName", e.target.value)}
            className={baseInput}
            placeholder="Jane Smith"
            data-testid="input-contactName"
          />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className={baseInput}
            placeholder="jane@acmehotels.com"
            data-testid="input-email"
          />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={baseInput}
            placeholder="(305) 555-0123"
            data-testid="input-phone"
          />
        </div>

        <div>
          <label className={labelCls}>Partner Type</label>
          <select
            value={form.partnerType}
            onChange={(e) => update("partnerType", e.target.value)}
            className={baseInput}
            data-testid="select-partnerType"
          >
            <option value="">Select…</option>
            {PARTNER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Portal Use Case</label>
          <select
            value={form.portalUseCase}
            onChange={(e) => update("portalUseCase", e.target.value)}
            className={baseInput}
            data-testid="select-portalUseCase"
          >
            <option value="">Select…</option>
            {USE_CASES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Estimated Volume</label>
          <select
            value={form.estimatedVolume}
            onChange={(e) => update("estimatedVolume", e.target.value)}
            className={baseInput}
            data-testid="select-estimatedVolume"
          >
            <option value="">Select…</option>
            {VOLUMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Tell us what you want the portal to help with</label>
          <textarea
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            rows={5}
            className={baseInput}
            placeholder="What types of requests should the portal handle? Who will use it? Any deadlines or recurring events?"
            data-testid="textarea-message"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          We'll review your request and follow up within 1–2 business days.
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center px-7 py-3 bg-[#0E1B3D] hover:bg-[#0a1430] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold uppercase tracking-[0.08em] rounded-md transition-colors"
          data-testid="button-submit-partnership"
        >
          {status === "submitting" ? "Submitting…" : "Request Partnership Portal"}
        </button>
      </div>
    </form>
  );
}
