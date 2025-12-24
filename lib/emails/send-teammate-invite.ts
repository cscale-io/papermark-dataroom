import TeamInvitation from "@/components/emails/team-invitation";

import { sendEmail } from "@/lib/resend";

export const sendTeammateInviteEmail = async ({
  senderName,
  senderEmail,
  teamName,
  to,
  url,
}: {
  senderName: string;
  senderEmail: string;
  teamName: string;
  to: string;
  url: string;
}) => {
  console.log("[TEAM_INVITE] Starting sendTeammateInviteEmail", {
    to,
    senderEmail,
    teamName,
    urlLength: url?.length,
    nodeEnv: process.env.NODE_ENV,
  });

  try {
    const result = await sendEmail({
      to: to,
      subject: `You are invited to join team`,
      react: TeamInvitation({
        senderName,
        senderEmail,
        teamName,
        url,
      }),
      test: process.env.NODE_ENV === "development",
      system: true,
    });

    console.log("[TEAM_INVITE] Email sent successfully", {
      to,
      result,
    });

    return result;
  } catch (error) {
    console.error("[TEAM_INVITE] Failed to send email", {
      to,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
};
