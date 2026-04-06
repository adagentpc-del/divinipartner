import { logger } from "./logger";

export function generatePdfHtml(data: {
  partnerName: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  eventName: string;
  eventDate: string | null;
  venueName: string | null;
  venueAddress: string | null;
  items: { category: string; itemName: string }[];
  uploads: { uploadType: string; fileName: string }[];
  internalSummary: string | null;
  aiSummary: string | null;
  recommendedUpsells: string[];
  createdAt: string;
}): string {
  const itemsHtml = data.items.length > 0
    ? data.items.map((i) => `<li>${i.category}: ${i.itemName}</li>`).join("")
    : "<li>No items selected</li>";

  const uploadsHtml = data.uploads.length > 0
    ? data.uploads.map((u) => `<li>${u.uploadType}: ${u.fileName}</li>`).join("")
    : "<li>No files uploaded</li>";

  const upsellsHtml = data.recommendedUpsells.length > 0
    ? data.recommendedUpsells.map((u) => `<li>${u}</li>`).join("")
    : "<li>No recommendations</li>";

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; margin: 40px; line-height: 1.6; }
  h1 { color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; }
  h2 { color: #333; margin-top: 24px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
  .badge { background: #1a1a2e; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
  .section { margin-bottom: 20px; }
  .detail-row { display: flex; margin-bottom: 4px; }
  .detail-label { font-weight: 600; min-width: 150px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  .summary-block { background: #f8f9fa; padding: 16px; border-radius: 8px; white-space: pre-wrap; font-size: 13px; }
  .timestamp { color: #888; font-size: 12px; margin-top: 30px; }
</style>
</head>
<body>
  <div class="header">
    <h1>A3 Visual - Project Request Summary</h1>
    <span class="badge">A3 Partner Portal</span>
  </div>

  <div class="section">
    <h2>Partner</h2>
    <p>${data.partnerName}</p>
  </div>

  <div class="section">
    <h2>Contact &amp; Event Details</h2>
    <div class="detail-row"><span class="detail-label">Company:</span> ${data.companyName}</div>
    <div class="detail-row"><span class="detail-label">Contact:</span> ${data.contactName}</div>
    <div class="detail-row"><span class="detail-label">Email:</span> ${data.email}</div>
    <div class="detail-row"><span class="detail-label">Phone:</span> ${data.phone || "N/A"}</div>
    <div class="detail-row"><span class="detail-label">Event:</span> ${data.eventName}</div>
    <div class="detail-row"><span class="detail-label">Event Date:</span> ${data.eventDate || "TBD"}</div>
    <div class="detail-row"><span class="detail-label">Venue:</span> ${data.venueName || "TBD"}</div>
    <div class="detail-row"><span class="detail-label">Address:</span> ${data.venueAddress || "TBD"}</div>
  </div>

  <div class="section">
    <h2>Selected Services</h2>
    <ul>${itemsHtml}</ul>
  </div>

  <div class="section">
    <h2>Uploaded Files</h2>
    <ul>${uploadsHtml}</ul>
  </div>

  <div class="section">
    <h2>Internal Summary</h2>
    <div class="summary-block">${data.internalSummary || "Not generated"}</div>
  </div>

  <div class="section">
    <h2>AI Summary</h2>
    <div class="summary-block">${data.aiSummary || "Not generated"}</div>
  </div>

  <div class="section">
    <h2>Recommended Upsells</h2>
    <ul>${upsellsHtml}</ul>
  </div>

  <p class="timestamp">Generated: ${data.createdAt}</p>
</body>
</html>`;
}
