/**
 * Visible simulator copy. Strings match the product spec so labels stay stable.
 * Household names in chips are fictional sample data.
 */

export const WELCOME_TITLE = "Hearthkeep simulation";

export const WELCOME_BODY =
  "This is a simulated Alexa+ household agent talking to a real local MCP server. It is not Amazon, and it is not a real device.";

export const DATA_NOTICE =
  "Names, prices, parts, and appointments are fictional sample data. Nothing is purchased.";

export const FICTIONAL_CHIP = "Fictional data";

export const SIMULATION_RIBBON = "SIMULATION — not a real Alexa+ device";

export const TRY_HINT = "Try: What needs doing?";

export const NEXT_MORNING_LABEL = "Next morning";

/** Shown on its own line in the About dialog so the license identifier is visible. */
export const ABOUT_LICENSE = "License: MIT";

/** Demo script order from the product spec, section 9.6. */
export const DEMO_CHIP_LABELS = [
  "What needs doing?",
  "Order a new filter for the fridge",
  "Yes, the CX-28",
  "Say purchase code (demo)",
  "The hallway smoke alarm keeps chirping",
  "Done, I swapped it",
  "Book someone to clean the dryer vent next week",
  "Tuesday morning",
  "Approve with code (demo)",
  "I just installed a new water heater, a Brimwell WH-40, in the garage",
  "When is the water heater due?",
  "I smell gas in the kitchen",
] as const;
