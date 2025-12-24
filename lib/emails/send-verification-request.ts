import { sendEmail } from "@/lib/resend";

import LoginLink from "@/components/emails/verification-link";

import { generateChecksum } from "../utils/generate-checksum";

export const sendVerificationRequestEmail = async (params: {
  email: string;
  url: string;
}) => {
  const { url, email } = params;
  console.log("[sendVerificationRequestEmail] Called with:", {
    email,
    url: url.substring(0, 50) + "...",
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  });

  const checksum = generateChecksum(url);
  const verificationUrlParams = new URLSearchParams({
    verification_url: url,
    checksum,
  });

  const verificationUrl = `${process.env.NEXTAUTH_URL}/verify?${verificationUrlParams}`;
  const emailTemplate = LoginLink({ url: verificationUrl });

  console.log("[sendVerificationRequestEmail] Sending email:", {
    to: email,
    fromAddress: "C.Scale DataRoom <dataroom@updates.cscale.io>",
  });

  try {
    const result = await sendEmail({
      to: email as string,
      system: true,
      subject: "Your C.Scale DataRoom Login Link",
      react: emailTemplate,
    });
    console.log("[sendVerificationRequestEmail] Email sent successfully:", result);
  } catch (e) {
    console.error("[sendVerificationRequestEmail] Email send FAILED:", e);
  }
};
