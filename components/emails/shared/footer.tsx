import { Hr, Section, Text } from "@react-email/components";

export const Footer = ({
  withAddress = false,
  footerText = "If you have any feedback or questions about this email, simply reply to it.",
}: {
  withAddress?: boolean;
  footerText?: string | React.ReactNode;
}) => {
  return (
    <>
      <Hr />
      <Section className="text-gray-400">
        <Text className="text-xs">
          © {new Date().getFullYear()} C.Scale. All rights reserved.
        </Text>
        <Text className="text-xs">{footerText}</Text>
      </Section>
    </>
  );
};
