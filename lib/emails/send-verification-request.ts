import { sendEmail } from "@/lib/resend";

import LoginLink from "@/components/emails/verification-link";

import { generateChecksum } from "../utils/generate-checksum";

export const sendVerificationRequestEmail = async (params: {
  email: string;
  url: string;
}) => {
  const { url, email } = params;
  const checksum = generateChecksum(url);
  const verificationUrlParams = new URLSearchParams({
    verification_url: url,
    checksum,
  });

  const verificationUrl = `${process.env.NEXTAUTH_URL}/verify?${verificationUrlParams}`;
  const emailTemplate = LoginLink({ url: verificationUrl });

  await sendEmail({
    to: email as string,
    system: true,
    subject: "Your C.Scale DataRoom Login Link",
    react: emailTemplate,
  });
};
