/**
 * Fictional MCP Apps card resources for the Hearthkeep simulation.
 * Inline HTML only. No network URLs. Taps post intents, never tool calls.
 */
import { checkoutCardHtml, optionsCardHtml, receiptCardHtml, statusCardHtml, taskCardHtml } from "./card-html";

export const MCP_APP_HTML_MIME = "text/html;profile=mcp-app";

export interface CardResource {
  uri: string;
  name: string;
  description: string;
  mimeType: typeof MCP_APP_HTML_MIME;
  text: string;
}

export const CARD_RESOURCES: readonly CardResource[] = [
  {
    uri: "ui://hearthkeep/status-card.html",
    name: "status-card",
    description: "Fictional upkeep status card for get_upkeep_status.",
    mimeType: MCP_APP_HTML_MIME,
    text: statusCardHtml(),
  },
  {
    uri: "ui://hearthkeep/options-carousel.html",
    name: "options-carousel",
    description: "Fictional options card for find_parts and find_service_slots.",
    mimeType: MCP_APP_HTML_MIME,
    text: optionsCardHtml(),
  },
  {
    uri: "ui://hearthkeep/checkout-card.html",
    name: "checkout-card",
    description: "Fictional checkout card for prepare_checkout.",
    mimeType: MCP_APP_HTML_MIME,
    text: checkoutCardHtml(),
  },
  {
    uri: "ui://hearthkeep/receipt-card.html",
    name: "receipt-card",
    description: "Fictional receipt card for confirm_purchase and cancel_order.",
    mimeType: MCP_APP_HTML_MIME,
    text: receiptCardHtml(),
  },
  {
    uri: "ui://hearthkeep/task-card.html",
    name: "task-card",
    description: "Fictional task card for create_task and log_maintenance.",
    mimeType: MCP_APP_HTML_MIME,
    text: taskCardHtml(),
  },
];

/** Visual P0 tools and the card each one references. */
export const TOOL_UI: Readonly<Record<string, string>> = {
  get_upkeep_status: "ui://hearthkeep/status-card.html",
  find_parts: "ui://hearthkeep/options-carousel.html",
  find_service_slots: "ui://hearthkeep/options-carousel.html",
  prepare_checkout: "ui://hearthkeep/checkout-card.html",
  confirm_purchase: "ui://hearthkeep/receipt-card.html",
  create_task: "ui://hearthkeep/task-card.html",
  log_maintenance: "ui://hearthkeep/task-card.html",
};

export function listCardResources(): Array<Omit<CardResource, "text">> {
  return CARD_RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType }));
}

export function readCardResource(uri: string): { uri: string; mimeType: string; text: string } | undefined {
  const found = CARD_RESOURCES.find((card) => card.uri === uri);
  if (found === undefined) return undefined;
  return { uri: found.uri, mimeType: found.mimeType, text: found.text };
}
