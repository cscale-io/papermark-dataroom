import type { NextApiRequest, NextApiResponse } from "next";

import { isS3Configured } from "@/ee/features/storage/config";
import { MultiRegionS3Store } from "@/ee/features/storage/s3-store";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import slugify from "@sindresorhus/slugify";
import { Server } from "@tus/server";
import { getServerSession } from "next-auth/next";
import path from "node:path";

import { getTeamS3ClientAndConfig } from "@/lib/files/aws-client";
import { RedisLocker } from "@/lib/files/tus-redis-locker";
import { newId } from "@/lib/id-helper";
import { lockerRedisClient } from "@/lib/redis";
import { log } from "@/lib/utils";

import { authOptions } from "../../auth/[...nextauth]";

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false,
  },
};

// Lazy initialization of TUS server - only created when S3 is configured and first request comes in
let tusServer: Server | null = null;
let tusServerInitError: string | null = null;

function getTusServer(): Server | null {
  // If we already tried and failed, return null
  if (tusServerInitError) {
    console.log("[TUS] Server initialization previously failed:", tusServerInitError);
    return null;
  }

  // If already initialized, return it
  if (tusServer) {
    return tusServer;
  }

  // Check if S3 is configured before trying to create the server
  if (!isS3Configured()) {
    tusServerInitError = "S3 storage is not configured. TUS uploads require S3/R2 storage.";
    console.log("[TUS] Cannot initialize server:", tusServerInitError);
    console.log("[TUS] If you want to use Vercel Blob instead, set NEXT_PUBLIC_UPLOAD_TRANSPORT=vercel");
    return null;
  }

  try {
    console.log("[TUS] Initializing TUS server with S3 storage...");

    const locker = new RedisLocker({
      redisClient: lockerRedisClient,
    });

    tusServer = new Server({
      // `path` needs to match the route declared by the next file router
      path: "/api/file/tus",
      maxSize: 1024 * 1024 * 1024 * 2, // 2 GiB
      respectForwardedHeaders: true,
      locker,
      datastore: new MultiRegionS3Store(),
      namingFunction(req, metadata) {
        const { teamId, fileName } = metadata as {
          teamId: string;
          fileName: string;
        };
        const docId = newId("doc");
        const { name, ext } = path.parse(fileName);
        const newName = `${teamId}/${docId}/${slugify(name)}${ext}`;
        console.log("[TUS] Generated upload path:", newName);
        return newName;
      },
      generateUrl(req, { proto, host, path, id }) {
        // Encode the ID to be URL safe
        id = Buffer.from(id, "utf-8").toString("base64url");
        return `${proto}://${host}${path}/${id}`;
      },
      getFileIdFromRequest(req) {
        // Extract the ID from the URL
        const id = (req.url as string).split("/api/file/tus/")[1];
        return Buffer.from(id, "base64url").toString("utf-8");
      },
      onResponseError(req, res, err) {
        log({
          message: "Error uploading a file. Error: \n\n" + err,
          type: "error",
        });
        console.error("[TUS] Upload error:", err);
        return { status_code: 500, body: "Internal Server Error" };
      },
      async onUploadFinish(req, res, upload) {
        try {
          console.log("[TUS] Upload finished, updating metadata for:", upload.id);
          const metadata = upload.metadata || {};
          const contentType = metadata.contentType || "application/octet-stream";
          const { name, ext } = path.parse(metadata.fileName!);
          const contentDisposition = `attachment; filename="${slugify(name)}${ext}"`;

          // The Key (object path) where the file was uploaded
          const objectKey = upload.id;

          // Extract teamId from the object key (format: teamId/docId/filename)
          const teamId = objectKey.split("/")[0];
          if (!teamId) {
            throw { status_code: 500, body: "Invalid object key format" };
          }

          // Get team-specific S3 client and config
          const { client, config } = await getTeamS3ClientAndConfig(teamId);

          // Copy the object onto itself, replacing the metadata
          const params = {
            Bucket: config.bucket,
            CopySource: `${config.bucket}/${objectKey}`,
            Key: objectKey,
            ContentType: contentType,
            ContentDisposition: contentDisposition,
            MetadataDirective: "REPLACE" as const,
          };

          const copyCommand = new CopyObjectCommand(params);
          await client.send(copyCommand);

          console.log("[TUS] Metadata updated successfully for:", upload.id);
          return res;
        } catch (error) {
          console.error("[TUS] Error updating metadata:", error);
          throw { status_code: 500, body: "Error updating metadata" };
        }
      },
    });

    console.log("[TUS] Server initialized successfully");
    return tusServer;
  } catch (error) {
    tusServerInitError = error instanceof Error ? error.message : String(error);
    console.error("[TUS] Failed to initialize server:", tusServerInitError);
    return null;
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("[TUS] Received request:", req.method, req.url);

  // Get the session
  const session = getServerSession(req, res, authOptions);
  if (!session) {
    console.log("[TUS] Unauthorized request - no session");
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Get or initialize the TUS server
  const server = getTusServer();
  if (!server) {
    console.log("[TUS] Server not available, returning 503");
    return res.status(503).json({
      message: "TUS uploads are not available. S3 storage is not configured.",
      hint: "If you want to use Vercel Blob instead of S3, ensure NEXT_PUBLIC_UPLOAD_TRANSPORT=vercel is set and use the standard upload endpoint.",
    });
  }

  return server.handle(req, res);
}
