/**
 * Fictional MCP Apps card shells for the Hearthkeep simulation.
 * Inline HTML only. No network URLs. The simulator fills these in a later chunk.
 */

export const MCP_APP_HTML_MIME = "text/html;profile=mcp-app";

export interface CardResource {
  uri: string;
  name: string;
  description: string;
  mimeType: typeof MCP_APP_HTML_MIME;
  text: string;
}

function page(title: string, marker: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    "<style>body{font:16px sans-serif;margin:16px}.chip{font-size:12px}</style>",
    "</head>",
    "<body>",
    '<p class="chip">Fictional data</p>',
    `<main data-card="${marker}"></main>`,
    "<script>",
    `document.documentElement.dataset.card=${JSON.stringify(marker)};`,
    "</script>",
    "</body>",
    "</html>",
  ].join("");
}

export const CARD_RESOURCES: readonly CardResource[] = [
  {
    uri: "ui://hearthkeep/status-card.html",
    name: "status-card",
    description: "Fictional upkeep status card for get_upkeep_status.",
    mimeType: MCP_APP_HTML_MIME,
    text: page("Upkeep status", "status"),
  },
  {
    uri: "ui://hearthkeep/options-carousel.html",
    name: "options-carousel",
    description: "Fictional options card for find_parts and find_service_slots.",
    mimeType: MCP_APP_HTML_MIME,
    text: page("Options", "options"),
  },
  {
    uri: "ui://hearthkeep/checkout-card.html",
    name: "checkout-card",
    description: "Fictional checkout card for prepare_checkout.",
    mimeType: MCP_APP_HTML_MIME,
    text: page("Checkout", "checkout"),
  },
  {
    uri: "ui://hearthkeep/receipt-card.html",
    name: "receipt-card",
    description: "Fictional receipt card for confirm_purchase.",
    mimeType: MCP_APP_HTML_MIME,
    text: page("Receipt", "receipt"),
  },
  {
    uri: "ui://hearthkeep/task-card.html",
    name: "task-card",
    description: "Fictional task card for create_task and log_maintenance.",
    mimeType: MCP_APP_HTML_MIME,
    text: page("Task", "task"),
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
