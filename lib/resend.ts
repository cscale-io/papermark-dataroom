import { JSXElementConstructor, ReactElement } from "react";

import { render, toPlainText } from "@react-email/render";
import { Resend } from "resend";

import { log, nanoid } from "@/lib/utils";

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Set RESEND_TEST_MODE=true in .env.local to redirect all emails to delivered@resend.dev
const isTestMode = process.env.RESEND_TEST_MODE === "true";

console.log("[Resend] Module initialized:", {
  RESEND_API_KEY_SET: !!process.env.RESEND_API_KEY,
  RESEND_API_KEY_PREFIX: process.env.RESEND_API_KEY?.substring(0, 8) + "...",
  resendClientCreated: !!resend,
  RESEND_TEST_MODE: isTestMode,
});

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
  console.log("[Resend sendEmail] Called with:", {
    to,
    subject,
    test,
    system,
    marketing,
    verify,
    resendInitialized: !!resend,
  });

  if (!resend) {
    // Throw an error if resend is not initialized
    console.error("[Resend sendEmail] FAILED: Resend not initialized - check RESEND_API_KEY");
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
  
  console.log("[Resend sendEmail] Preparing to send:", {
    from: fromAddress,
    to: actualRecipient,
    originalTo: to,
    testMode: isTestMode || test,
    subject,
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

    console.log("[Resend sendEmail] API Response:", {
      success: !error,
      data,
      error,
    });

    // Check if the email sending operation returned an error and throw it
    if (error) {
      log({
        message: `Resend returned error when sending email: ${error.name} \n\n ${error.message}`,
        type: "error",
        mention: true,
      });
      throw error;
    }

    // If there's no error, return the data
    return data;
  } catch (exception) {
    // Log and rethrow any caught exceptions for upstream handling
    console.error("[Resend sendEmail] Exception caught:", exception);
    log({
      message: `Unexpected error when sending email: ${exception}`,
      type: "error",
      mention: true,
    });
    throw exception; // Rethrow the caught exception
  }
};
