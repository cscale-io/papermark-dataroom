"use client";

import { useParams } from "next/navigation";

import { useState } from "react";

import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";

import { LastUsed, useLastUsed } from "@/components/hooks/useLastUsed";
import Google from "@/components/shared/icons/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { next } = useParams as { next?: string };

  const [lastUsed, setLastUsed] = useLastUsed();
  const authMethods = ["google", "email"] as const;
  type AuthMethod = (typeof authMethods)[number];
  const [clickedMethod, setClickedMethod] = useState<AuthMethod | undefined>(
    undefined,
  );
  const [email, setEmail] = useState<string>("");
  const [emailButtonText, setEmailButtonText] = useState<string>(
    "Continue with Email",
  );

  const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: "Please enter a valid email." })
    .email({ message: "Please enter a valid email." });

  const emailValidation = emailSchema.safeParse(email);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="z-10 mx-5 h-fit w-full max-w-md overflow-hidden rounded-lg sm:mx-0">
        <div className="flex flex-col space-y-3 px-4 py-6 pt-8 sm:px-12">
          <h1 className="text-balance text-3xl font-semibold text-gray-900">
            Welcome to C.Scale
          </h1>
          <h3 className="text-balance text-sm text-gray-800">
            Secure Data Room
          </h3>
        </div>
        <form
          className="flex flex-col gap-4 px-4 pt-8 sm:px-12"
          onSubmit={(e) => {
            e.preventDefault();
            if (!emailValidation.success) {
              toast.error(emailValidation.error.errors[0].message);
              return;
            }

            setClickedMethod("email");
            signIn("email", {
              email: emailValidation.data,
              redirect: false,
              ...(next && next.length > 0 ? { callbackUrl: next } : {}),
            }).then((res) => {
              if (res?.ok && !res?.error) {
                setEmail("");
                setLastUsed("credentials");
                setEmailButtonText("Email sent - check your inbox!");
                toast.success("Email sent - check your inbox!");
              } else {
                setEmailButtonText("Error sending email - try again?");
                toast.error("Error sending email - try again?");
              }
              setClickedMethod(undefined);
            });
          }}
        >
          <Label className="sr-only" htmlFor="email">
            Email
          </Label>
          <Input
            id="email"
            placeholder="name@example.com"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            disabled={clickedMethod === "email"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              "flex h-10 w-full rounded-md border-0 bg-background bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white",
              email.length > 0 && !emailValidation.success
                ? "ring-red-500"
                : "ring-gray-200",
            )}
          />
          <div className="relative">
            <Button
              type="submit"
              loading={clickedMethod === "email"}
              disabled={!emailValidation.success || !!clickedMethod}
              className={cn(
                "focus:shadow-outline w-full transform rounded px-4 py-2 text-white transition-colors duration-300 ease-in-out focus:outline-none",
                clickedMethod === "email"
                  ? "bg-black"
                  : "bg-gray-800 hover:bg-gray-900",
              )}
            >
              {emailButtonText}
            </Button>
            {lastUsed === "credentials" && <LastUsed />}
          </div>
        </form>
        <p className="py-4 text-center">or</p>
        <div className="flex flex-col space-y-2 px-4 sm:px-12">
          <div className="relative">
            <Button
              onClick={() => {
                setClickedMethod("google");
                setLastUsed("google");
                signIn("google", {
                  ...(next && next.length > 0 ? { callbackUrl: next } : {}),
                }).then((res) => {
                  setClickedMethod(undefined);
                });
              }}
              loading={clickedMethod === "google"}
              disabled={clickedMethod && clickedMethod !== "google"}
              className="flex w-full items-center justify-center space-x-2 border border-gray-300 bg-gray-100 font-normal text-gray-900 hover:bg-gray-200"
            >
              <Google className="h-5 w-5" />
              <span>Continue with Google</span>
              {clickedMethod !== "google" && lastUsed === "google" && (
                <LastUsed />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
