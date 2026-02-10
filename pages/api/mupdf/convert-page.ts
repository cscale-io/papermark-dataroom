import { NextApiRequest, NextApiResponse } from "next";

import { DocumentPage } from "@prisma/client";
import { get } from "@vercel/edge-config";
import { waitUntil } from "@vercel/functions";
import * as mupdf from "mupdf";

import { getFile } from "@/lib/files/get-file";
import { putFileServer } from "@/lib/files/put-file-server";
import prisma from "@/lib/prisma";
import { log } from "@/lib/utils";

// This function can run for a maximum of 120 seconds
export const config = {
  maxDuration: 180,
};

export default async (req: NextApiRequest, res: NextApiResponse) => {
  // check if post method
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Extract the API Key from the Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1]; // Assuming the format is "Bearer [token]"

  // Check if the API Key matches
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { documentVersionId, pageNumber, url, teamId, storageType, fileKey } = req.body as {
    documentVersionId: string;
    pageNumber: number;
    url: string;
    teamId: string;
    storageType?: string;
    fileKey?: string;
  };

  // Log request details for debugging
  console.log("[convert-page] Request received", {
    documentVersionId,
    pageNumber,
    teamId,
    hasUrl: !!url,
    urlLength: url?.length,
    urlPrefix: url?.substring(0, 50),
  });

  try {
    // Step 1: Fetch the PDF data with retry logic
    console.log("[convert-page] Step 1: Fetching PDF from URL...", {
      fullUrl: url,
      urlType: typeof url,
      hasStorageMetadata: !!(storageType && fileKey),
    });
    
    let response: Response | undefined;
    let lastError: Error | null = null;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // For first attempt, use provided URL
        // For retries, regenerate the URL if we have the metadata
        let fetchUrl = url;
        
        if (attempt > 0 && storageType && fileKey) {
          console.log(`[convert-page] Attempt ${attempt + 1}: Regenerating URL with download authentication`, {
            storageType,
            fileKeyPrefix: fileKey.substring(0, 50),
          });
          
          // Use isDownload: true to force fresh signed URLs for both S3 and Vercel Blob
          fetchUrl = await getFile({
            type: storageType as any,
            data: fileKey,
            isDownload: true,
          });
          
          console.log(`[convert-page] New authenticated URL generated`, {
            urlPrefix: fetchUrl.substring(0, 50),
          });
        }

        console.log(`[convert-page] Attempt ${attempt + 1}: Fetching PDF...`);
        response = await fetch(fetchUrl, {
          headers: {
            "Accept": "application/pdf",
            "User-Agent": "Papermark-PDFProcessor/1.0",
          },
        });

        console.log("[convert-page] PDF fetch response", {
          attempt: attempt + 1,
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        });

        if (response.ok) {
          // Success! Break out of retry loop
          console.log(`[convert-page] Successfully fetched PDF on attempt ${attempt + 1}`);
          break;
        }

        // If we get 403/401, the URL might be expired or blocked
        if (response.status === 403 || response.status === 401) {
          const errorBody = await response.text();
          lastError = new Error(`HTTP ${response.status}: ${errorBody.substring(0, 100)}`);
          console.log(`[convert-page] Attempt ${attempt + 1} failed with ${response.status}${attempt < maxRetries - 1 ? ", will retry..." : ""}`);
          
          // Add exponential backoff before retry
          if (attempt < maxRetries - 1) {
            const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`[convert-page] Waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          continue;
        }

        // For other errors, throw immediately
        const errorBody = await response.text();
        throw new Error(`PDF fetch failed with status ${response.status}: ${errorBody.substring(0, 100)}`);
        
      } catch (error) {
        lastError = error as Error;
        console.error(`[convert-page] Attempt ${attempt + 1} error:`, String(error));
        
        if (attempt < maxRetries - 1) {
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`[convert-page] Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // If all retries failed
    if (!response || !response.ok) {
      console.error("[convert-page] PDF fetch FAILED after all retries", { 
        error: String(lastError),
        attempts: maxRetries,
      });
      log({
        message: `Failed to fetch PDF in conversion process after ${maxRetries} attempts with error: \n\n Error: ${lastError} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });
      throw new Error(`Failed to fetch pdf on document page ${pageNumber} after ${maxRetries} retries`);
    }

    // Step 2: Convert the response to a buffer
    console.log("[convert-page] Step 2: Converting response to ArrayBuffer...");
    const pdfData = await response.arrayBuffer();
    console.log("[convert-page] ArrayBuffer created", { byteLength: pdfData.byteLength });

    // Validate that we actually received a PDF, not an error page
    const pdfBytes = new Uint8Array(pdfData);
    const first4Bytes = String.fromCharCode(...pdfBytes.slice(0, 4));
    const first100Chars = new TextDecoder().decode(pdfBytes.slice(0, 100));
    
    console.log("[convert-page] PDF validation", {
      first4Bytes,
      isPdfHeader: first4Bytes === "%PDF",
      first100Chars: first100Chars.substring(0, 100),
      contentType: response.headers.get("content-type"),
    });

    if (first4Bytes !== "%PDF") {
      // Not a PDF - probably an error page or expired URL
      const errorPreview = first100Chars.substring(0, 200);
      console.error("[convert-page] NOT A PDF! Received:", errorPreview);
      log({
        message: `PDF URL returned non-PDF content. First bytes: "${first4Bytes}". Preview: ${errorPreview}\n\n\`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
        type: "error",
        mention: true,
      });
      throw new Error(`URL did not return a PDF. Content-Type: ${response.headers.get("content-type")}. Preview: ${errorPreview.substring(0, 50)}`);
    }

    // Step 3: Create a MuPDF instance
    console.log("[convert-page] Step 3: Creating MuPDF document...");
    var doc = new mupdf.PDFDocument(pdfData);
    console.log("[convert-page] MuPDF document created successfully");
    console.log("Original document size:", pdfData.byteLength);

    // Step 4: Load the page
    console.log("[convert-page] Step 4: Loading page", { pageNumber, pageIndex: pageNumber - 1 });
    const page = doc.loadPage(pageNumber - 1); // 0-based page index
    console.log("[convert-page] Page loaded successfully");

    // get the bounds of the page for orientation and scaling
    const bounds = page.getBounds();
    const [ulx, uly, lrx, lry] = bounds;
    const widthInPoints = Math.abs(lrx - ulx);
    const heightInPoints = Math.abs(lry - uly);

    // Validate document dimensions
    if (widthInPoints <= 0 || heightInPoints <= 0) {
      throw new Error(
        `Invalid page dimensions: ${widthInPoints} × ${heightInPoints} points`,
      );
    }

    // Log original dimensions for debugging
    console.log(
      `Original page dimensions: ${widthInPoints} × ${heightInPoints} points (${(widthInPoints / 72).toFixed(1)}" × ${(heightInPoints / 72).toFixed(1)}")`,
    );

    if (pageNumber === 1) {
      // get the orientation of the document and update document version
      const isVertical = heightInPoints > widthInPoints;

      await prisma.documentVersion.update({
        where: { id: documentVersionId },
        data: { isVertical },
      });
    }

    // Calculate optimal scale factor based on document dimensions and memory constraints
    const getOptimalScaleFactor = (width: number, height: number): number => {
      // Maximum reasonable pixel dimensions to prevent memory issues
      const MAX_PIXEL_DIMENSION = 8000;
      const MAX_TOTAL_PIXELS = 32_000_000; // ~32MP to stay within memory limits

      // Start with default scaling logic
      // Note: Avoid scale factor 3 exactly due to mupdf 1.26.4 rendering bug with tiling patterns
      let scaleFactor = width >= 1600 ? 2 : 2.95;

      // Check if scaled dimensions would exceed limits
      const scaledWidth = width * scaleFactor;
      const scaledHeight = height * scaleFactor;
      const totalPixels = scaledWidth * scaledHeight;

      // Reduce scale factor if dimensions are too large
      if (
        scaledWidth > MAX_PIXEL_DIMENSION ||
        scaledHeight > MAX_PIXEL_DIMENSION ||
        totalPixels > MAX_TOTAL_PIXELS
      ) {
        // Calculate maximum safe scale factor
        const maxScaleByWidth = MAX_PIXEL_DIMENSION / width;
        const maxScaleByHeight = MAX_PIXEL_DIMENSION / height;
        const maxScaleByTotal = Math.sqrt(MAX_TOTAL_PIXELS / (width * height));

        scaleFactor = Math.min(
          maxScaleByWidth,
          maxScaleByHeight,
          maxScaleByTotal,
        );

        // Ensure minimum scale factor of 1
        scaleFactor = Math.max(1, Math.floor(scaleFactor * 10) / 10); // Round down to 1 decimal

        console.log(
          `Large document detected. Reduced scale factor from ${width >= 1600 ? 2 : 2.95} to ${scaleFactor}`,
        );
      }

      return scaleFactor;
    };

    const scaleFactor = getOptimalScaleFactor(widthInPoints, heightInPoints);
    const doc_to_screen = mupdf.Matrix.scale(scaleFactor, scaleFactor);

    console.log("Scale factor:", scaleFactor);
    console.log(
      "Final dimensions:",
      `${widthInPoints * scaleFactor} × ${heightInPoints * scaleFactor}`,
    );

    // get links
    const links = page.getLinks();
    const embeddedLinks = links.map((link) => {
      return { href: link.getURI(), coords: link.getBounds().join(",") };
    });

    // Check embedded links for blocked keywords
    if (embeddedLinks.length > 0) {
      try {
        const keywords = await get("keywords");
        if (Array.isArray(keywords) && keywords.length > 0) {
          for (const link of embeddedLinks) {
            if (link.href) {
              const matchedKeyword = keywords.find(
                (keyword) =>
                  typeof keyword === "string" && link.href.includes(keyword),
              );

              if (matchedKeyword) {
                waitUntil(
                  log({
                    message: `Document processing blocked: ${matchedKeyword} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
                    type: "error",
                    mention: true,
                  }),
                );
                res.status(400).json({
                  error: "Document processing blocked",
                  matchedUrl: link.href,
                  matchedKeyword: matchedKeyword,
                  pageNumber: pageNumber,
                });
                return;
              }
            }
          }
        }
      } catch (error) {
        // Log error but continue processing if check fails
        console.log("Failed to check keywords:", error);
      }
    }

    // Will be updated if we use a reduced scale factor
    let actualScaleFactor = scaleFactor;

    const metadata = {
      originalWidth: widthInPoints,
      originalHeight: heightInPoints,
      width: widthInPoints * actualScaleFactor,
      height: heightInPoints * actualScaleFactor,
      scaleFactor: actualScaleFactor,
    };

    // Estimate memory usage before creating pixmap
    const finalWidth = Math.floor(widthInPoints * scaleFactor);
    const finalHeight = Math.floor(heightInPoints * scaleFactor);
    const estimatedMemoryMB = (finalWidth * finalHeight * 3) / (1024 * 1024); // RGB = 3 bytes per pixel

    console.log(
      `Estimated memory usage: ${estimatedMemoryMB.toFixed(1)}MB for ${finalWidth} × ${finalHeight} pixels`,
    );

    // Warn if memory usage is high
    if (estimatedMemoryMB > 200) {
      console.warn(
        `High memory usage expected: ${estimatedMemoryMB.toFixed(1)}MB. Consider reducing document size.`,
      );
    }

    // Step 5: Create pixmap (rasterize the page)
    console.log("[convert-page] Step 5: Creating pixmap...", {
      scaleFactor,
      finalWidth,
      finalHeight,
      estimatedMemoryMB: estimatedMemoryMB.toFixed(1),
    });

    console.time("toPixmap");
    let scaledPixmap;
    try {
      scaledPixmap = page.toPixmap(
        doc_to_screen,
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );
    } catch (error) {
      // If pixmap creation fails, try with a smaller scale factor
      console.error(
        "Pixmap creation failed, attempting with reduced scale factor:",
        error,
      );
      const reducedScaleFactor = Math.max(1, scaleFactor * 0.5);
      console.log(`Retrying with reduced scale factor: ${reducedScaleFactor}`);

      const reduced_doc_to_screen = mupdf.Matrix.scale(
        reducedScaleFactor,
        reducedScaleFactor,
      );
      scaledPixmap = page.toPixmap(
        reduced_doc_to_screen,
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );

      // Update metadata with actual scale factor used
      actualScaleFactor = reducedScaleFactor;
      metadata.width = widthInPoints * actualScaleFactor;
      metadata.height = heightInPoints * actualScaleFactor;
      metadata.scaleFactor = actualScaleFactor;
      console.log(
        "Successfully created pixmap with reduced scale factor:",
        actualScaleFactor,
      );
    }
    console.timeEnd("toPixmap");
    console.log("[convert-page] Pixmap created successfully");

    // Step 6: Encode as PNG and JPEG to compare sizes
    console.log("[convert-page] Step 6: Encoding image...");
    console.time("compare");
    console.time("asPNG");
    const pngBuffer = scaledPixmap.asPNG(); // as PNG
    console.timeEnd("asPNG");
    console.time("asJPEG");
    const jpegBuffer = scaledPixmap.asJPEG(80, false); // as JPEG
    console.timeEnd("asJPEG");

    const pngSize = pngBuffer.byteLength;
    const jpegSize = jpegBuffer.byteLength;

    let chosenBuffer;
    let chosenFormat;
    if (pngSize < jpegSize) {
      chosenBuffer = pngBuffer;
      chosenFormat = "png";
    } else {
      chosenBuffer = jpegBuffer;
      chosenFormat = "jpeg";
    }

    console.log("Chosen format:", chosenFormat);

    console.timeEnd("compare");

    let buffer = Buffer.from(chosenBuffer);

    // get docId from url with starts with "doc_" with regex
    const match = url.match(/(doc_[^\/]+)\//);
    const docId = match ? match[1] : undefined;

    // Step 7: Upload to storage
    console.log("[convert-page] Step 7: Uploading to storage...", {
      fileName: `page-${pageNumber}.${chosenFormat}`,
      bufferSize: buffer.byteLength,
      teamId,
      docId,
      uploadTransport: process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT,
    });

    // Retry logic for blob upload (up to 3 attempts)
    let type: any;
    let data: any;
    let uploadAttempts = 0;
    const maxUploadAttempts = 3;
    
    while (uploadAttempts < maxUploadAttempts) {
      uploadAttempts++;
      try {
        const result = await putFileServer({
          file: {
            name: `page-${pageNumber}.${chosenFormat}`,
            type: `image/${chosenFormat}`,
            buffer: buffer,
          },
          teamId: teamId,
          docId: docId,
        });
        type = result.type;
        data = result.data;
        break; // Success, exit loop
      } catch (uploadError) {
        console.error(`Upload attempt ${uploadAttempts} failed:`, uploadError);
        if (uploadAttempts >= maxUploadAttempts) {
          throw new Error(`Failed to upload after ${maxUploadAttempts} attempts: ${uploadError}`);
        }
        // Wait before retry (exponential backoff: 1s, 2s, 4s)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, uploadAttempts - 1) * 1000));
      }
    }

    console.log("[convert-page] Upload successful", { type, dataLength: data?.length });

    buffer = Buffer.alloc(0); // free memory
    chosenBuffer = Buffer.alloc(0); // free memory
    scaledPixmap.destroy(); // free memory
    page.destroy(); // free memory

    if (!data || !type) {
      throw new Error(`Failed to upload document page ${pageNumber}`);
    }

    // Step 8: Save to database
    console.log("[convert-page] Step 8: Saving to database...");
    let documentPage: DocumentPage | null = null;

    // Check if a documentPage with the same pageNumber and versionId already exists
    const existingPage = await prisma.documentPage.findUnique({
      where: {
        pageNumber_versionId: {
          pageNumber: pageNumber,
          versionId: documentVersionId,
        },
      },
    });

    if (!existingPage) {
      // Only create a new documentPage if it doesn't already exist
      documentPage = await prisma.documentPage.create({
        data: {
          versionId: documentVersionId,
          pageNumber: pageNumber,
          file: data,
          storageType: type,
          pageLinks: embeddedLinks,
          metadata: metadata,
        },
      });
    } else {
      documentPage = existingPage;
    }

    // Send the images as a response
    console.log("[convert-page] Complete! documentPageId:", documentPage.id);
    res.status(200).json({ documentPageId: documentPage.id });
    return;
  } catch (error) {
    console.error("[convert-page] FAILED with error:", error);
    log({
      message: `Failed to convert page with error: \n\n Error: ${error} \n\n \`Metadata: {teamId: ${teamId}, documentVersionId: ${documentVersionId}, pageNumber: ${pageNumber}}\``,
      type: "error",
      mention: true,
    });
    throw error;
  }
};
