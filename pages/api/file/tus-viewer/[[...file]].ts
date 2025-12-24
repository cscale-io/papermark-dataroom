import type { NextApiRequest, NextApiResponse } from "next";

import { isS3Configured } from "@/ee/features/storage/config";
import { MultiRegionS3Store } from "@/ee/features/storage/s3-store";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import slugify from "@sindresorhus/slugify";
import { Server } from "@tus/server";
import path from "node:path";

import { verifyDataroomSessionInPagesRouter } from "@/lib/auth/dataroom-auth";
import { getTeamS3ClientAndConfig } from "@/lib/files/aws-client";
import { RedisLocker } from "@/lib/files/tus-redis-locker";
import { newId } from "@/lib/id-helper";
import prisma from "@/lib/prisma";
import { lockerRedisClient } from "@/lib/redis";
import { log } from "@/lib/utils";

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
    console.log("[TUS-Viewer] Server initialization previously failed:", tusServerInitError);
    return null;
  }

  // If already initialized, return it
  if (tusServer) {
    return tusServer;
  }

  // Check if S3 is configured before trying to create the server
  if (!isS3Configured()) {
    tusServerInitError = "S3 storage is not configured. TUS uploads require S3/R2 storage.";
    console.log("[TUS-Viewer] Cannot initialize server:", tusServerInitError);
    console.log("[TUS-Viewer] If you want to use Vercel Blob instead, set NEXT_PUBLIC_UPLOAD_TRANSPORT=vercel");
    return null;
  }

  try {
    console.log("[TUS-Viewer] Initializing TUS server with S3 storage...");

    const locker = new RedisLocker({
      redisClient: lockerRedisClient,
    });

    tusServer = new Server({
      // `path` needs to match the route declared by the next file router
      path: "/api/file/tus-viewer",
      maxSize: 1024 * 1024 * 1024 * 2, // 2 GiB
      respectForwardedHeaders: true,
      locker,
      datastore: new MultiRegionS3Store(),
      async namingFunction(req, metadata) {
        // Extract viewer data from metadata
        const { teamId, fileName, viewerId, linkId, dataroomId } = metadata as {
          teamId: string;
          fileName: string;
          viewerId: string;
          linkId: string;
          dataroomId: string;
        };

        // Validate the viewer exists and has permission
        let teamIdToUse = teamId;
        try {
          if (teamId !== "visitor-upload") {
            throw new Error("Unauthorized to access this team");
          }

          const link = await prisma.link.findUnique({
            where: {
              id: linkId,
              dataroomId: dataroomId || null,
            },
            select: { teamId: true, enableUpload: true },
          });

          if (!link || !link.enableUpload || !link.teamId) {
            throw new Error("Upload not allowed");
          }

          const viewer = await prisma.viewer.findUnique({
            where: { id: viewerId },
            select: { teamId: true },
          });

          if (!viewer || viewer.teamId !== link.teamId) {
            throw new Error("Unauthorized to access this team");
          }

          teamIdToUse = link.teamId;
        } catch (error) {
          console.error("[TUS-Viewer] Error validating viewer:", error);
          throw new Error("Unauthorized");
        }

        const docId = newId("doc");
        const { name, ext } = path.parse(fileName);
        const newName = `${teamIdToUse}/${docId}/${slugify(name)}${ext}`;
        console.log("[TUS-Viewer] Generated upload path:", newName);
        return newName;
      },
      generateUrl(req, { proto, host, path, id }) {
        // Encode the ID to be URL safe
        id = Buffer.from(id, "utf-8").toString("base64url");
        return `${proto}://${host}${path}/${id}`;
      },
      getFileIdFromRequest(req) {
        // Extract the ID from the URL
        const id = (req.url as string).split("/api/file/tus-viewer/")[1];
        return Buffer.from(id, "base64url").toString("utf-8");
      },
      onResponseError(req, res, err) {
        log({
          message: "Error uploading a file via viewer. Error: \n\n" + err,
          type: "error",
        });
        console.error("[TUS-Viewer] Upload error:", err);
        return { status_code: 500, body: "Internal Server Error" };
      },
      async onUploadCreate(req, res, upload) {
        // Extract viewer data from metadata
        const { teamId, fileName, viewerId, linkId, dataroomId } =
          upload.metadata as {
            teamId: string;
            fileName: string;
            viewerId: string;
            dataroomId: string;
            linkId: string;
          };

        // Validate the viewer exists and has permission
        try {
          if (teamId !== "visitor-upload") {
            throw new Error("Unauthorized to access this team");
          }

          const link = await prisma.link.findUnique({
            where: {
              id: linkId,
              dataroomId: dataroomId || null,
            },
            select: { teamId: true, enableUpload: true },
          });

          if (!link || !link.enableUpload || !link.teamId) {
            throw new Error("Upload not allowed");
          }

          const viewer = await prisma.viewer.findUnique({
            where: { id: viewerId },
            select: { teamId: true },
          });

          if (!viewer || viewer.teamId !== link.teamId) {
            throw new Error("Unauthorized to access this team");
          }

          console.log("[TUS-Viewer] Upload created for viewer:", viewerId);
          return res;
        } catch (error) {
          console.error("[TUS-Viewer] Error validating viewer:", error);
          throw new Error("Unauthorized");
        }
      },
      async onUploadFinish(req, res, upload) {
        try {
          console.log("[TUS-Viewer] Upload finished, updating metadata for:", upload.id);
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

          console.log("[TUS-Viewer] Metadata updated successfully for:", upload.id);
          return res;
        } catch (error) {
          console.error("[TUS-Viewer] Error updating metadata:", error);
          throw { status_code: 500, body: "Error updating metadata" };
        }
      },
      async onIncomingRequest(req, res, uploadId) {
        // Check if this is a new upload or continuation
        if (req.method === "POST" && !uploadId) {
          // For new uploads, we need to parse the Upload-Metadata header to get linkId and dataroomId
          const metadataHeader = req.headers["upload-metadata"];

          if (!metadataHeader) {
            throw { status_code: 403, body: "Missing upload metadata" };
          }

          // Parse TUS metadata (format: key base64value,key2 base64value2)
          const metadata: Record<string, string> = {};
          const headerString = Array.isArray(metadataHeader)
            ? metadataHeader[0]
            : metadataHeader;
          headerString.split(",").forEach((item: string) => {
            const [key, value] = item.trim().split(" ");
            if (key && value) {
              metadata[key] = Buffer.from(value, "base64").toString();
            }
          });

          const { linkId, dataroomId, viewerId } = metadata;

          if (!linkId || !dataroomId) {
            throw { status_code: 403, body: "Missing required metadata" };
          }

          // Verify the session
          const session = await verifyDataroomSessionInPagesRouter(
            req as NextApiRequest,
            linkId,
            dataroomId,
          );

          if (!session) {
            throw { status_code: 403, body: "Unauthorized" };
          }

          // Optional: Verify that the viewerId in the request matches the session
          if (viewerId && session.viewerId && viewerId !== session.viewerId) {
            throw { status_code: 403, body: "Invalid viewer" };
          }
        }
      },
    });

    console.log("[TUS-Viewer] Server initialized successfully");
    return tusServer;
  } catch (error) {
    tusServerInitError = error instanceof Error ? error.message : String(error);
    console.error("[TUS-Viewer] Failed to initialize server:", tusServerInitError);
    return null;
  }
}

// CORS headers to allow custom domains
const setCorsHeaders = (req: NextApiRequest, res: NextApiResponse) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, GET, OPTIONS, DELETE, PATCH, HEAD",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Upload-Length, Upload-Metadata, Upload-Offset, Tus-Resumable, Upload-Defer-Length, Upload-Concat",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata, Upload-Defer-Length, Upload-Concat",
  );
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("[TUS-Viewer] Received request:", req.method, req.url);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    return res.status(204).end();
  }

  // Set CORS headers for all requests
  setCorsHeaders(req, res);

  // Get or initialize the TUS server
  const server = getTusServer();
  if (!server) {
    console.log("[TUS-Viewer] Server not available, returning 503");
    return res.status(503).json({
      message: "TUS uploads are not available. S3 storage is not configured.",
      hint: "If you want to use Vercel Blob instead of S3, ensure NEXT_PUBLIC_UPLOAD_TRANSPORT=vercel is set and use the standard upload endpoint.",
    });
  }

  // No session check - authentication is handled via viewer metadata
  return server.handle(req, res);
}
