import { Resend } from "resend";
import { logger } from "./logger";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data: any) => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key as string,
    fromEmail: connectionSettings.settings.from_email as string,
  };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

export async function sendRequestNotification(params: {
  partnerName: string;
  contactName: string;
  eventName: string;
  eventDate: string | null;
  categories: string[];
  requestId: number;
}) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@a3visual.com";

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { publicLink, warnIfFallback } = await import("./publicUrl");
    warnIfFallback();
    const requestUrl = publicLink(`/admin/requests/${params.requestId}`);

    await client.emails.send({
      from: fromEmail || "A3 Partner Portal <noreply@resend.dev>",
      to: adminEmail,
      subject: `New Request: ${params.eventName} from ${params.partnerName}`,
      html: `
        <h2>New Project Request Submitted</h2>
        <p><strong>Partner:</strong> ${params.partnerName}</p>
        <p><strong>Contact:</strong> ${params.contactName}</p>
        <p><strong>Event:</strong> ${params.eventName}</p>
        <p><strong>Event Date:</strong> ${params.eventDate || "TBD"}</p>
        <p><strong>Categories:</strong> ${params.categories.join(", ") || "None specified"}</p>
        <p><a href="${requestUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a2e;color:white;text-decoration:none;border-radius:6px;">View Request</a></p>
      `,
    });
    logger.info({ requestId: params.requestId }, "Notification email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send notification email");
  }
}
