// import { EmailTemplate } from "@/components/email-template";
import config from "@/lib/config";
import { NextRequest } from "next/server";
import { handlePrismaOperation } from "prisma/db";
import { Resend } from "resend";

const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export async function GET(req: NextRequest) {
  try {
    // Ensure only authorized cron jobs can access this route

    const cronSecret = config.CRON_SECRET;
    const authHeader = req.headers.get("authorization") ?? "";

    if (!cronSecret)
      return new Response("Missing cron secret", { status: 500 });

    if (authHeader !== `Bearer ${cronSecret}`)
      return new Response("Unauthorized", { status: 401 });

    // Built per request: Resend throws on a missing key, which would fail the
    // build when the module is evaluated for page-data collection.
    if (!config.RESEND_API_KEY)
      return new Response("Missing Resend API key", { status: 500 });
    const resend = new Resend(config.RESEND_API_KEY);

    const sendList =
      config.RESEND_JOB_SEND_LIST?.split(";").filter(Boolean) || [];
    if (sendList.length === 0)
      return new Response("No email recipients configured", { status: 500 });

    const feedBack = await handlePrismaOperation((prisma) =>
      prisma.feedback.findMany({
        where: {
          // when created in the past 7 days
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    );
    if (!feedBack.success) throw new Error(feedBack.error);

    if (feedBack.data.length === 0)
      return new Response("No feedback to send", { status: 200 });

    const feedback = feedBack.data
      .flatMap((fb) => [
        `<p>Type: ${escapeHtml(fb.type)}</p>`,
        `<p>Message: ${escapeHtml(fb.message)}</p>`,
        `<p>User Email: ${escapeHtml(fb.userEmail)}</p>`,
        `<p>Created At: ${fb.createdAt}</p>`,
        `<hr />`,
      ])
      .join("");

    const { error } = await resend.emails.send({
      // TODO configure domain
      from: "project-rdc@resend.dev",
      to: sendList,
      subject: "Project RDC Feedback Received",
      html: `<h1>Here is the feedback for the last 7 days.</h1><div>${feedback}</div>`,
      // react: EmailTemplate(),
    });
    if (error) throw error;
    else {
      const res = await handlePrismaOperation((prisma) =>
        prisma.feedback.deleteMany({
          where: {
            // when created in the past 7 days
            id: { in: feedBack.data.map((fb) => fb.id) },
          },
        }),
      );
      if (!res.success) throw new Error(res.error);
    }
    return new Response("Emails sent successfully", { status: 200 });
  } catch (error) {
    // console.error("Error sending feedback emails", { error });
    return new Response("Failed to send emails", { status: 500 });
  }
}
