import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

import { VIDEO_EVENT_TYPES } from "../constants";
import { WEBHOOK_TRIGGERS } from "../webhook/constants";

// Only initialize Tinybird if token is configured
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;
const tb = TINYBIRD_TOKEN 
  ? new Tinybird({ 
      token: TINYBIRD_TOKEN,
      baseUrl: process.env.TINYBIRD_BASE_URL || "https://api.us-east.aws.tinybird.co"
    }) 
  : null;

// Helper to create a no-op pipe that returns empty data when Tinybird is not configured
const createNoOpPipe = <T>() => async (): Promise<{ data: T[] }> => ({ data: [] });

// Check if Tinybird is enabled
export const isTinybirdEnabled = () => !!TINYBIRD_TOKEN;

export const getTotalAvgPageDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_average_page_duration__v5",
      parameters: z.object({
        documentId: z.string(),
        excludedLinkIds: z.string().describe("Comma separated linkIds"),
        excludedViewIds: z.string().describe("Comma separated viewIds"),
        since: z.number(),
      }),
      data: z.object({
        versionNumber: z.number().int(),
        pageNumber: z.string(),
        avg_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ versionNumber: number; pageNumber: string; avg_duration: number }>();

export const getViewPageDuration = tb
  ? tb.buildPipe({
      pipe: "get_page_duration_per_view__v5",
      parameters: z.object({
        documentId: z.string(),
        viewId: z.string(),
        since: z.number(),
        until: z.number().optional(),
      }),
      data: z.object({
        pageNumber: z.string(),
        sum_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ pageNumber: string; sum_duration: number }>();

export const getViewCompletionStats = tb
  ? tb.buildPipe({
      pipe: "get_view_completion_stats__v1",
      parameters: z.object({
        documentId: z.string(),
        excludedViewIds: z.string().describe("Comma separated viewIds"),
        since: z.number(),
      }),
      data: z.object({
        viewId: z.string(),
        versionNumber: z.number().int(),
        pages_viewed: z.number(),
      }),
    })
  : createNoOpPipe<{ viewId: string; versionNumber: number; pages_viewed: number }>();

export const getTotalDocumentDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_document_duration__v1",
      parameters: z.object({
        documentId: z.string(),
        excludedLinkIds: z.string().describe("Comma separated linkIds"),
        excludedViewIds: z.string().describe("Comma separated viewIds"),
        since: z.number(),
        until: z.number().optional(),
      }),
      data: z.object({
        sum_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ sum_duration: number }>();

export const getTotalLinkDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_link_duration__v1",
      parameters: z.object({
        linkId: z.string(),
        documentId: z.string(),
        excludedViewIds: z.string().describe("Comma separated viewIds"),
        since: z.number(),
        until: z.number().optional(),
      }),
      data: z.object({
        sum_duration: z.number(),
        view_count: z.number(),
      }),
    })
  : createNoOpPipe<{ sum_duration: number; view_count: number }>();

export const getTotalViewerDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_viewer_duration__v1",
      parameters: z.object({
        viewIds: z.string().describe("Comma separated viewIds"),
        since: z.number(),
        until: z.number().optional(),
      }),
      data: z.object({
        sum_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ sum_duration: number }>();

export const getViewUserAgent_v2 = tb
  ? tb.buildPipe({
      pipe: "get_useragent_per_view__v2",
      parameters: z.object({
        documentId: z.string(),
        viewId: z.string(),
        since: z.number(),
      }),
      data: z.object({
        country: z.string(),
        city: z.string(),
        browser: z.string(),
        os: z.string(),
        device: z.string(),
      }),
    })
  : createNoOpPipe<{ country: string; city: string; browser: string; os: string; device: string }>();

export const getViewUserAgent = tb
  ? tb.buildPipe({
      pipe: "get_useragent_per_view__v3",
      parameters: z.object({
        viewId: z.string(),
      }),
      data: z.object({
        country: z.string(),
        city: z.string(),
        browser: z.string(),
        os: z.string(),
        device: z.string(),
      }),
    })
  : createNoOpPipe<{ country: string; city: string; browser: string; os: string; device: string }>();

export const getTotalDataroomDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_dataroom_duration__v1",
      parameters: z.object({
        dataroomId: z.string(),
        excludedLinkIds: z.array(z.string()),
        excludedViewIds: z.array(z.string()),
        since: z.number(),
      }),
      data: z.object({
        viewId: z.string(),
        sum_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ viewId: string; sum_duration: number }>();

export const getDocumentDurationPerViewer = tb
  ? tb.buildPipe({
      pipe: "get_document_duration_per_viewer__v1",
      parameters: z.object({
        documentId: z.string(),
        viewIds: z.string().describe("Comma separated viewIds"),
      }),
      data: z.object({
        sum_duration: z.number(),
      }),
    })
  : createNoOpPipe<{ sum_duration: number }>();

export const getWebhookEvents = tb
  ? tb.buildPipe({
      pipe: "get_webhook_events__v1",
      parameters: z.object({
        webhookId: z.string(),
      }),
      data: z.object({
        event_id: z.string(),
        webhook_id: z.string(),
        message_id: z.string(),
        event: z.enum(WEBHOOK_TRIGGERS),
        url: z.string(),
        http_status: z.number(),
        request_body: z.string(),
        response_body: z.string(),
        timestamp: z.string(),
      }),
    })
  : createNoOpPipe<{ event_id: string; webhook_id: string; message_id: string; event: string; url: string; http_status: number; request_body: string; response_body: string; timestamp: string }>();

export const getVideoEventsByDocument = tb
  ? tb.buildPipe({
      pipe: "get_video_events_by_document__v1",
      parameters: z.object({
        document_id: z.string(),
      }),
      data: z.object({
        timestamp: z.string(),
        view_id: z.string(),
        event_type: z.enum(VIDEO_EVENT_TYPES),
        start_time: z.number(),
        end_time: z.number(),
        playback_rate: z.number(),
        volume: z.number(),
        is_muted: z.number(),
        is_focused: z.number(),
        is_fullscreen: z.number(),
      }),
    })
  : createNoOpPipe<{ timestamp: string; view_id: string; event_type: string; start_time: number; end_time: number; playback_rate: number; volume: number; is_muted: number; is_focused: number; is_fullscreen: number }>();

export const getVideoEventsByView = tb
  ? tb.buildPipe({
      pipe: "get_video_events_by_view__v1",
      parameters: z.object({
        document_id: z.string(),
        view_id: z.string(),
      }),
      data: z.object({
        timestamp: z.string(),
        event_type: z.string(),
        start_time: z.number(),
        end_time: z.number(),
      }),
    })
  : createNoOpPipe<{ timestamp: string; event_type: string; start_time: number; end_time: number }>();

export const getClickEventsByView = tb
  ? tb.buildPipe({
      pipe: "get_click_events_by_view__v1",
      parameters: z.object({
        document_id: z.string(),
        view_id: z.string(),
      }),
      data: z.object({
        timestamp: z.string(),
        document_id: z.string(),
        dataroom_id: z.string().nullable(),
        view_id: z.string(),
        page_number: z.string(),
        version_number: z.number(),
        href: z.string(),
      }),
    })
  : createNoOpPipe<{ timestamp: string; document_id: string; dataroom_id: string | null; view_id: string; page_number: string; version_number: number; href: string }>();

export const getTotalTeamDuration = tb
  ? tb.buildPipe({
      pipe: "get_total_team_duration__v1",
      parameters: z.object({
        documentIds: z.string().describe("Comma separated documentIds"),
        since: z.number(),
        until: z.number(),
      }),
      data: z.object({
        total_duration: z.number(),
        unique_countries: z.array(z.string()),
      }),
    })
  : createNoOpPipe<{ total_duration: number; unique_countries: string[] }>();
