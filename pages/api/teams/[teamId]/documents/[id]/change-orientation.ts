import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";
import { version } from "os";

import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[DEBUG_API] change-orientation.ts called", { method: req.method, teamId: req.query.teamId, docId: req.query.id });
  
  if (req.method === "POST") {
    // POST /api/teams/:teamId/documents/:id/change-orientation
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      console.log("[DEBUG_API] change-orientation.ts unauthorized - no session");
      return res.status(401).end("Unauthorized");
    }

    const { teamId, id: docId } = req.query as { teamId: string; id: string };
    const { versionId, isVertical } = req.body as {
      versionId: string;
      isVertical: boolean;
    };

    const userId = (session.user as CustomUser).id;
    console.log("[DEBUG_API] change-orientation.ts params", { teamId, docId, versionId, isVertical, userId });

    try {
      const team = await prisma.team.findUnique({
        where: {
          id: teamId,
          users: {
            some: {
              userId,
            },
          },
          documents: {
            some: {
              id: {
                equals: docId,
              },
            },
          },
        },
        select: {
          id: true,
        },
      });

      if (!team) {
        console.log("[DEBUG_API] change-orientation.ts team not found", { teamId, userId });
        return res.status(401).end("Unauthorized");
      }

      console.log("[DEBUG_API] change-orientation.ts updating version", { versionId, isVertical });
      await prisma.documentVersion.update({
        where: {
          id: versionId,
        },
        data: {
          isVertical,
        },
      });

      await fetch(
        `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${docId}`,
      );

      console.log("[DEBUG_API] change-orientation.ts success");
      return res.status(200).json({
        message: `Document orientation changed to ${isVertical ? "portrait" : "landscape"}!`,
      });
    } catch (error) {
      console.error("[DEBUG_API] change-orientation.ts error", { error: (error as Error).message, stack: (error as Error).stack });
      return errorhandler(error, res);
    }
  } else {
    // We only allow POST requests
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
