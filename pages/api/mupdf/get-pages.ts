import { NextApiRequest, NextApiResponse } from "next";

import * as mupdf from "mupdf";

import { getFile } from "@/lib/files/get-file";

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

  try {
    const { url, storageType, fileKey } = req.body as { 
      url: string;
      storageType?: string;
      fileKey?: string;
    };
    
    // Fetch the PDF data with retry logic
    let response: Response | undefined;
    let lastError: Error | null = null;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // For first attempt, use provided URL
        // For retries, regenerate the URL if we have the metadata
        let fetchUrl = url;
        
        if (attempt > 0 && storageType && fileKey) {
          console.log(`[get-pages] Attempt ${attempt + 1}: Regenerating URL with download authentication`, {
            storageType,
            fileKeyPrefix: fileKey.substring(0, 50),
          });
          
          // Use isDownload: true to force fresh signed URLs for both S3 and Vercel Blob
          fetchUrl = await getFile({
            type: storageType as any,
            data: fileKey,
            isDownload: true,
          });
          
          console.log(`[get-pages] New authenticated URL generated`);
        }

        console.log(`[get-pages] Attempt ${attempt + 1}: Fetching PDF...`);
        response = await fetch(fetchUrl, {
          headers: {
            "Accept": "application/pdf",
            "User-Agent": "Papermark-PDFProcessor/1.0",
          },
        });

        if (response.ok) {
          // Success! Break out of retry loop
          console.log(`[get-pages] Successfully fetched PDF on attempt ${attempt + 1}`);
          break;
        }

        // If we get 403/401, the URL might be expired or blocked
        if (response.status === 403 || response.status === 401) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          console.log(`[get-pages] Attempt ${attempt + 1} failed with ${response.status}${attempt < maxRetries - 1 ? ", will retry..." : ""}`);
          
          // Add exponential backoff before retry
          if (attempt < maxRetries - 1) {
            const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`[get-pages] Waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          continue;
        }

        // For other errors, throw immediately
        throw new Error(`PDF fetch failed with status ${response.status}: ${response.statusText}`);
        
      } catch (error) {
        lastError = error as Error;
        console.error(`[get-pages] Attempt ${attempt + 1} error:`, String(error));
        
        if (attempt < maxRetries - 1) {
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`[get-pages] Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // If all retries failed
    if (!response || !response.ok) {
      console.error("[get-pages] PDF fetch FAILED after all retries", { 
        error: String(lastError),
        attempts: maxRetries,
      });
      throw lastError || new Error("Failed to fetch PDF after retries");
    }
    
    // Convert the response to an ArrayBuffer
    const pdfData = await response.arrayBuffer();
    // Create a MuPDF instance
    var doc = new mupdf.PDFDocument(pdfData);

    var n = doc.countPages();

    // Send the images as a response
    res.status(200).json({ numPages: n });
  } catch (error) {
    console.error("[get-pages] Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
