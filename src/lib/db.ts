/**
 * Data calls - same public API as before, but every call now hits the Express
 * backend (src/lib/api.ts) instead of Supabase PostgREST/Storage. Function
 * signatures are unchanged so the pages need no rewrites for data access.
 */
import { apiGet, apiSend, apiUpload, apiBlob } from './api';

export async function createCompanyForUser(_userId: string, payload: {
  kind: 'buyer' | 'vendor'; name: string; contact_name?: string; email?: string;
  phone?: string; city?: string; region?: string; services?: string[];
}) {
  // userId is now derived from the verified token on the backend.
  return apiSend('POST', '/companies', payload);
}

export async function getBuildings(companyId: string) {
  return apiGet<any[]>(`/buildings?companyId=${encodeURIComponent(companyId)}`);
}

export async function createBuilding(payload: { company_id: string; name: string; location?: string; developer?: string }) {
  return apiSend('POST', '/buildings', payload);
}

export async function getOpenPackages(filter?: { categories?: string[] }) {
  const qs = filter?.categories?.length ? `?categories=${encodeURIComponent(filter.categories.join(','))}` : '';
  return apiGet<any[]>(`/packages/open${qs}`);
}

export async function getMyBids(companyId: string) {
  return apiGet<any[]>(`/bids/mine?companyId=${encodeURIComponent(companyId)}`);
}

export async function getVendorProfile(companyId: string) {
  return apiGet<any>(`/vendor-profiles/${encodeURIComponent(companyId)}`);
}

export async function getBuilding(id: string) {
  return apiGet<any>(`/buildings/${encodeURIComponent(id)}`);
}
export async function getPackages(buildingId: string) {
  return apiGet<any[]>(`/buildings/${encodeURIComponent(buildingId)}/packages`);
}
export async function createPackage(buildingId: string, p: { category: string; status?: string; deadline?: string; budget_min?: number; budget_max?: number; }) {
  return apiSend('POST', `/buildings/${encodeURIComponent(buildingId)}/packages`, p);
}
export async function getPackage(id: string) {
  return apiGet<any>(`/packages/${encodeURIComponent(id)}`);
}
export async function setPackageStatus(id: string, status: string) {
  await apiSend('POST', `/packages/${encodeURIComponent(id)}/status`, { status });
}

export async function getLineItems(packageId: string) {
  return apiGet<any[]>(`/packages/${encodeURIComponent(packageId)}/line-items`);
}
export async function addLineItem(packageId: string, li: { description: string; qty?: number; unit?: string; cost_code?: string; item_no?: string; }) {
  await apiSend('POST', `/packages/${encodeURIComponent(packageId)}/line-items`, li);
}
export async function deleteLineItem(id: string) {
  await apiSend('DELETE', `/line-items/${encodeURIComponent(id)}`);
}

export async function getDocuments(opts: { packageId?: string; buildingId?: string }) {
  const params = new URLSearchParams();
  if (opts.packageId) params.set('packageId', opts.packageId);
  else if (opts.buildingId) params.set('buildingId', opts.buildingId);
  const qs = params.toString();
  return apiGet<any[]>(`/documents${qs ? `?${qs}` : ''}`);
}
export async function uploadDocument(file: File, opts: { companyId: string; userId?: string; buildingId?: string; packageId?: string }) {
  const form = new FormData();
  form.append('file', file);
  form.append('companyId', opts.companyId);
  if (opts.buildingId) form.append('buildingId', opts.buildingId);
  if (opts.packageId) form.append('packageId', opts.packageId);
  return apiUpload('/documents', form);
}
export async function signedUrl(path: string) {
  try {
    const { signedUrl } = await apiGet<{ signedUrl: string }>(`/documents/signed-url?path=${encodeURIComponent(path)}`);
    return signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function getBidsForPackage(packageId: string) {
  return apiGet<any[]>(`/packages/${encodeURIComponent(packageId)}/bids`);
}
export async function submitPricedBid(packageId: string, vendorCompanyId: string, payload: {
  price: number; days: number; note?: string; items?: { line_item_id: string; unit_price: number; qty: number; amount: number }[];
}) {
  return apiSend('POST', `/packages/${encodeURIComponent(packageId)}/bids`, { vendorCompanyId, ...payload });
}

export async function getQuestions(packageId: string) {
  return apiGet<any[]>(`/packages/${encodeURIComponent(packageId)}/questions`);
}
export async function askQuestion(packageId: string, vendorCompanyId: string, question: string) {
  await apiSend('POST', `/packages/${encodeURIComponent(packageId)}/questions`, { vendorCompanyId, question });
}
export async function answerQuestion(id: string, answer: string) {
  await apiSend('POST', `/questions/${encodeURIComponent(id)}/answer`, { answer });
}

// ---- company profile + account ----
export async function updateCompany(id: string, patch: { name?: string; contact_name?: string; phone?: string; city?: string }) {
  return apiSend('PATCH', `/companies/${encodeURIComponent(id)}`, patch);
}
export async function deleteMyAccount() {
  await apiSend('POST', '/account/delete');
}
export async function exportMyData() {
  const blob = await apiBlob('/account/export');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `divini-partners-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  // Defer cleanup: revoking synchronously after click cancels the download in
  // Firefox/Safari. A macrotask tick lets the browser start the download first.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 0);
}

// ---- feature flags ----
export async function getFeatureFlags() {
  return apiGet<any[]>('/feature-flags');
}
export async function setFeatureFlag(key: string, patch: { enabled?: boolean; audience?: string }) {
  await apiSend('PATCH', `/feature-flags/${encodeURIComponent(key)}`, patch);
}
