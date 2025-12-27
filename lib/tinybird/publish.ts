import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

import { VIDEO_EVENT_TYPES } from "../constants";
import { WEBHOOK_TRIGGERS } from "../webhook/constants";

// Only initialize Tinybird if token is configured
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;
const tb = TINYBIRD_TOKEN ? new Tinybird({ token: TINYBIRD_TOKEN }) : null;

// Helper to create a no-op ingest endpoint that does nothing when Tinybird is not configured
const createNoOpIngest = () => async () => {};

export const publishPageView = tb
  ? tb.buildIngestEndpoint({
      datasource: "page_views__v3",
      event: z.object({
        id: z.string(),
        linkId: z.string(),
        documentId: z.string(),
        viewId: z.string(),
        dataroomId: z.string().nullable().optional(),
        versionNumber: z.number().int().min(1).max(65535).optional().default(1),
        time: z.number().int(),
        duration: z.number().int(),
        pageNumber: z.string(),
        country: z.string().optional().default("Unknown"),
        city: z.string().optional().default("Unknown"),
        region: z.string().optional().default("Unknown"),
        latitude: z.string().optional().default("Unknown"),
        longitude: z.string().optional().default("Unknown"),
        ua: z.string().optional().default("Unknown"),
        browser: z.string().optional().default("Unknown"),
        browser_version: z.string().optional().default("Unknown"),
        engine: z.string().optional().default("Unknown"),
        engine_version: z.string().optional().default("Unknown"),
        os: z.string().optional().default("Unknown"),
        os_version: z.string().optional().default("Unknown"),
        device: z.string().optional().default("Desktop"),
        device_vendor: z.string().optional().default("Unknown"),
        device_model: z.string().optional().default("Unknown"),
        cpu_architecture: z.string().optional().default("Unknown"),
        bot: z.boolean().optional(),
        referer: z.string().optional().default("(direct)"),
        referer_url: z.string().optional().default("(direct)"),
      }),
    })
  : createNoOpIngest();

export const recordWebhookEvent = tb
  ? tb.buildIngestEndpoint({
      datasource: "webhook_events__v1",
      event: z.object({
        event_id: z.string(),
        webhook_id: z.string(),
        message_id: z.string(), // QStash message ID
        event: z.enum(WEBHOOK_TRIGGERS),
        url: z.string(),
        http_status: z.number(),
        request_body: z.string(),
        response_body: z.string(),
      }),
    })
  : createNoOpIngest();

export const recordVideoView = tb
  ? tb.buildIngestEndpoint({
      datasource: "video_views__v1",
      event: z.object({
        timestamp: z.string(),
        id: z.string(),
        link_id: z.string(),
        document_id: z.string(),
        view_id: z.string(),
        dataroom_id: z.string().nullable(),
        version_number: z.number(),
        event_type: z.enum(VIDEO_EVENT_TYPES),
        start_time: z.number(),
        end_time: z.number().optional(),
        playback_rate: z.number(),
        volume: z.number(),
        is_muted: z.number(),
        is_focused: z.number(),
        is_fullscreen: z.number(),
        country: z.string().optional().default("Unknown"),
        city: z.string().optional().default("Unknown"),
        region: z.string().optional().default("Unknown"),
        latitude: z.string().optional().default("Unknown"),
        longitude: z.string().optional().default("Unknown"),
        ua: z.string().optional().default("Unknown"),
        browser: z.string().optional().default("Unknown"),
        browser_version: z.string().optional().default("Unknown"),
        engine: z.string().optional().default("Unknown"),
        engine_version: z.string().optional().default("Unknown"),
        os: z.string().optional().default("Unknown"),
        os_version: z.string().optional().default("Unknown"),
        device: z.string().optional().default("Desktop"),
        device_vendor: z.string().optional().default("Unknown"),
        device_model: z.string().optional().default("Unknown"),
        cpu_architecture: z.string().optional().default("Unknown"),
        bot: z.boolean().optional(),
        referer: z.string().optional().default("(direct)"),
        referer_url: z.string().optional().default("(direct)"),
        ip_address: z.string().nullable(),
      }),
    })
  : createNoOpIngest();

// Click event tracking when user clicks a link within a document
export const recordClickEvent = tb
  ? tb.buildIngestEndpoint({
      datasource: "click_events__v1",
      event: z.object({
        timestamp: z.string(),
        event_id: z.string(),
        session_id: z.string(),
        link_id: z.string(),
        document_id: z.string(),
        view_id: z.string(),
        page_number: z.string(),
        href: z.string(),
        version_number: z.number(),
        dataroom_id: z.string().nullable(),
      }),
    })
  : createNoOpIngest();

// Event track when a visitor opens a link
export const recordLinkViewTB = tb
  ? tb.buildIngestEndpoint({
      datasource: "pm_click_events__v1",
      event: z.object({
        timestamp: z.string(),
        click_id: z.string(),
        view_id: z.string(),
        link_id: z.string(),
        document_id: z.string().nullable(),
        dataroom_id: z.string().nullable(),
        continent: z.string().optional().default("Unknown"),
        country: z.string().optional().default("Unknown"),
        city: z.string().optional().default("Unknown"),
        region: z.string().optional().default("Unknown"),
        latitude: z.string().optional().default("Unknown"),
        longitude: z.string().optional().default("Unknown"),
        device: z.string().optional().default("Desktop"),
        device_model: z.string().optional().default("Unknown"),
        device_vendor: z.string().optional().default("Unknown"),
        browser: z.string().optional().default("Unknown"),
        browser_version: z.string().optional().default("Unknown"),
        os: z.string().optional().default("Unknown"),
        os_version: z.string().optional().default("Unknown"),
        engine: z.string().optional().default("Unknown"),
        engine_version: z.string().optional().default("Unknown"),
        cpu_architecture: z.string().optional().default("Unknown"),
        ua: z.string().optional().default("Unknown"),
        bot: z.boolean().optional(),
        referer: z.string().optional().default("(direct)"),
        referer_url: z.string().optional().default("(direct)"),
        ip_address: z.string().nullable(),
      }),
    })
  : createNoOpIngest();
