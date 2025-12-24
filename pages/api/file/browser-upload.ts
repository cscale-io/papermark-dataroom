import type { NextApiRequest, NextApiResponse } from "next";

import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { getServerSession } from "next-auth/next";

import { SUPPORTED_DOCUMENT_MIME_TYPES } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

import { authOptions } from "../auth/[...nextauth]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const body = req.body as HandleUploadBody;
  console.log("[DEBUG_UPLOAD] browser-upload handler called", { bodyType: body?.type });

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname: string) => {
        // Generate a client token for the browser to upload the file
        console.log("[DEBUG_UPLOAD] onBeforeGenerateToken", { pathname });

        const session = await getServerSession(req, res, authOptions);
        if (!session) {
          console.log("[DEBUG_UPLOAD] Unauthorized - no session");
          res.status(401).end("Unauthorized");
          throw new Error("Unauthorized");
        }

        const userId = (session.user as CustomUser).id;
        console.log("[DEBUG_UPLOAD] Authenticated user", { userId });
        const team = await prisma.team.findFirst({
          where: {
            users: {
              some: {
                userId,
              },
            },
          },
          select: {
            plan: true,
          },
        });

        let maxSize = 30 * 1024 * 1024; // 30 MB
        const stripedTeamPlan = team?.plan.replace("+old", "");
        if (
          stripedTeamPlan &&
          ["business", "datarooms", "datarooms-plus"].includes(stripedTeamPlan)
        ) {
          maxSize = 100 * 1024 * 1024; // 100 MB
        }

        console.log("[DEBUG_UPLOAD] Returning token config", { maxSize, pathname, allowedContentTypes: SUPPORTED_DOCUMENT_MIME_TYPES.length });
        return {
          addRandomSuffix: true,
          allowedContentTypes: SUPPORTED_DOCUMENT_MIME_TYPES,
          maximumSizeInBytes: maxSize,
          metadata: JSON.stringify({
            // optional, sent to your server on upload completion
            userId: (session.user as CustomUser).id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[DEBUG_UPLOAD] onUploadCompleted", { blobUrl: blob.url });
        // Get notified of browser upload completion
        // ⚠️ This will not work on `localhost` websites,
        // Use ngrok or similar to get the full upload flow

        try {
          // Run any logic after the file upload completed
          // const { userId } = JSON.parse(tokenPayload);
          // await db.update({ avatar: blob.url, userId });
        } catch (error) {
          // throw new Error("Could not update user");
        }
      },
    });

    console.log("[DEBUG_UPLOAD] Handler success", { responseKeys: Object.keys(jsonResponse || {}) });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("[DEBUG_UPLOAD] Handler error", { error: (error as Error).message, stack: (error as Error).stack });
    // The webhook will retry 5 times waiting for a 200
    return res.status(400).json({ error: (error as Error).message });
  }
}
