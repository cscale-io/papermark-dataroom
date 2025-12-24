import { JSXElementConstructor, ReactElement } from "react";

import { render, toPlainText } from "@react-email/render";
import { Resend } from "resend";

import { log, nanoid } from "@/lib/utils";

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

console.log("[RESEND_INIT] Resend initialized:", {
  hasApiKey: !!process.env.RESEND_API_KEY,
  resendInitialized: !!resend,
});

// Set RESEND_TEST_MODE=true in .env.local to redirect all emails to delivered@resend.dev
const isTestMode = process.env.RESEND_TEST_MODE === "true";

export const sendEmail = async ({
  to,
  subject,
  react,
  from,
  marketing,
  system,
  verify,
  test,
  cc,
  replyTo,
  scheduledAt,
  unsubscribeUrl,
}: {
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
  from?: string;
  marketing?: boolean;
  system?: boolean;
  verify?: boolean;
  test?: boolean;
  cc?: string | string[];
  replyTo?: string;
  scheduledAt?: string;
  unsubscribeUrl?: string;
}) => {
  console.log("[SEND_EMAIL] Starting sendEmail", {
    to,
    subject,
    from,
    marketing,
    system,
    verify,
    test,
    isTestMode,
    hasResend: !!resend,
  });

  if (!resend) {
    console.error("[SEND_EMAIL] Resend not initialized - RESEND_API_KEY missing");
    throw new Error("Resend not initialized");
  }

  const html = await render(react);
  const plainText = toPlainText(html);

  const fromAddress =
    from ??
    (marketing
      ? "C.Scale DataRoom <dataroom@updates.cscale.io>"
      : system
        ? "C.Scale DataRoom <dataroom@updates.cscale.io>"
        : verify
          ? "C.Scale DataRoom <dataroom@updates.cscale.io>"
          : !!scheduledAt
            ? "C.Scale DataRoom <dataroom@updates.cscale.io>"
            : "C.Scale DataRoom <dataroom@updates.cscale.io>");

  // Use env var OR explicit test param to redirect to Resend's test inbox
  const actualRecipient = (isTestMode || test) ? "delivered@resend.dev" : to;

  console.log("[SEND_EMAIL] Prepared email", {
    fromAddress,
    actualRecipient,
    originalTo: to,
    redirectedToTest: isTestMode || test,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: actualRecipient,
      cc: cc,
      replyTo: marketing ? "dataroom@updates.cscale.io" : replyTo,
      subject,
      react,
      scheduledAt,
      text: plainText,
      headers: {
        "X-Entity-Ref-ID": nanoid(),
        ...(unsubscribeUrl ? { "List-Unsubscribe": unsubscribeUrl } : {}),
      },
    });

    console.log("[SEND_EMAIL] Resend API response", {
      data,
      error,
      to: actualRecipient,
    });

    // Check if the email sending operation returned an error and throw it
    if (error) {
      console.error("[SEND_EMAIL] Resend returned error", {
        errorName: error.name,
        errorMessage: error.message,
        to: actualRecipient,
      });
      log({
        message: `Resend returned error when sending email: ${error.name} \n\n ${error.message}`,
        type: "error",
        mention: true,
      });
      throw error;
    }

    console.log("[SEND_EMAIL] Email sent successfully", {
      emailId: data?.id,
      to: actualRecipient,
    });

    // If there's no error, return the data
    return data;
  } catch (exception) {
    console.error("[SEND_EMAIL] Unexpected exception", {
      exception: exception instanceof Error ? exception.message : exception,
      stack: exception instanceof Error ? exception.stack : undefined,
      to: actualRecipient,
    });
    log({
      message: `Unexpected error when sending email: ${exception}`,
      type: "error",
      mention: true,
    });
    throw exception;
  }
};
