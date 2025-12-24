import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";

import { authOptions } from "../../auth/[...nextauth]";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log("[DEBUG_API] archive.ts called", { method: req.method, id: req.query.id });
  
  if (req.method === "PUT") {
    // PUT /api/links/:id/archive
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      console.log("[DEBUG_API] archive.ts unauthorized - no session");
      return res.status(401).end("Unauthorized");
    }

    const { id } = req.query as { id: string };
    const { isArchived } = req.body;
    console.log("[DEBUG_API] archive.ts updating link", { id, isArchived });

    try {
      // Update the link in the database
      const updatedLink = await prisma.link.update({
        where: { id: id, deletedAt: null },
        data: {
          isArchived: isArchived,
        },
        include: {
          views: {
            orderBy: {
              viewedAt: "desc",
            },
          },
          _count: {
            select: { views: true },
          },
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  color: true,
                },
              },
            },
          },
        },
      });
      if (!updatedLink) {
        console.log("[DEBUG_API] archive.ts link not found", { id });
        return res.status(404).json({ error: "Link not found" });
      }

      const { tags, ...rest } = updatedLink;
      const linkTags = tags.map((t) => t.tag);

      await fetch(
        `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&linkId=${id}&hasDomain=${updatedLink.domainId ? "true" : "false"}`,
      );

      console.log("[DEBUG_API] archive.ts success", { id, isArchived });
      return res.status(200).json({ ...rest, tags: linkTags });
    } catch (error) {
      console.error("[DEBUG_API] archive.ts error", { error: (error as Error).message });
      return errorhandler(error, res);
    }
  }

  // We only allow PUT requests
  res.setHeader("Allow", ["PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
