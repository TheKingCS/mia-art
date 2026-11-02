/*
 * icons.js — MIA's interface icons (claude, 2026-10-15, DEC-0023).
 * One line-icon set for the frame (navigation, the bottom bar, header
 * badges, app tiles): 24-unit grid, 1.6 stroke, round joins, drawn in
 * currentColor so the theme colors them. Content keeps its own icons
 * (a mission's or a skill's emoji is the person's data, not chrome).
 *
 *   MIAIcons.svg("kitchen")      -> an <svg> element, or null
 *   MIAIcons.has("kitchen")      -> true
 *   MIAIcons.badge(node, appId)  -> swaps an emoji badge for the app's icon
 */
(function () {
  "use strict";
  // Each icon: SVG child markup on a 0 0 24 24 grid.
  const P = {
    mia: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2 16.3 14.6H7.7Z"/><circle cx="12" cy="12" r="1.3"/>',
    home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/>',
    apps: '<rect x="4" y="4" width="4" height="4" rx=".6"/><rect x="10" y="4" width="4" height="4" rx=".6"/><rect x="16" y="4" width="4" height="4" rx=".6"/><rect x="4" y="10" width="4" height="4" rx=".6"/><rect x="10" y="10" width="4" height="4" rx=".6"/><rect x="16" y="10" width="4" height="4" rx=".6"/><rect x="4" y="16" width="4" height="4" rx=".6"/><rect x="10" y="16" width="4" height="4" rx=".6"/><rect x="16" y="16" width="4" height="4" rx=".6"/>',
    greenhouse: '<path d="M12 21v-9"/><path d="M12 12c0-4.5 3.2-7.5 8-7.5 0 4.5-3.2 7.5-8 7.5Z"/><path d="M12 15c0-3.6-2.6-6-6.5-6 0 3.6 2.6 6 6.5 6Z"/><path d="M7 21h10"/>',
    garage: '<path d="M4 15.5 5.8 10a1.5 1.5 0 0 1 1.4-1h9.6a1.5 1.5 0 0 1 1.4 1l1.8 5.5"/><rect x="3" y="15.5" width="18" height="3.5" rx="1"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
    kitchen: '<path d="M7 3v7.5M5 3v4.5a2 2 0 0 0 4 0V3M7 10.5V21"/><path d="M17 21V3c-2 1.2-3 3.8-3 7v3h3"/>',
    workout: '<path d="M6.5 7.5v9M3.5 9.5v5M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
    real_estate: '<path d="M3 21V10.5l6-4 6 4V21"/><path d="M15 21v-8.5l6 3V21"/><path d="M7.5 21v-4h3v4"/><path d="M1.5 21h21"/>',
    property: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><rect x="10" y="12.5" width="4" height="4"/>',
    missions: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
    skills: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z"/><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8V6M13.9 13.1l3.3 1.9M10.1 13.1l-3.3 1.9"/>',
    budget: '<path d="M3.5 7.5h15a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M3.5 7.5 15 4v3.5"/><path d="M16 13.5h2.5"/>',
    maintenance: '<path d="M14.5 5.5a4 4 0 0 0-5.3 5.1L3.5 16.3v4.2h4.2l5.7-5.7a4 4 0 0 0 5.1-5.3l-2.8 2.8-2.6-.6-.6-2.6Z"/>',
    character: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    profile: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.5a3.4 3.4 0 0 1 6.4 0M14.5 10h3.5M14.5 13.5h3.5"/>',
    assistant: '<path d="M4 5h16v11H10l-5 4v-4H4Z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    household: '<path d="M4 10h16l-1.6 9.5a1.5 1.5 0 0 1-1.5 1.2H7.1a1.5 1.5 0 0 1-1.5-1.2Z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M15 14v3M12 14v3"/>',
    workshop: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
    reward_shop: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20.5h14v-8M12 8.5v12"/><path d="M12 8.5C10.5 5 7.5 4.5 7 6.5s3 2 5 2c2 0 5.5-.5 5-2s-3.5-1.5-5 2Z"/>',
    passwords: '<rect x="4.5" y="10.5" width="15" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
    compliance: '<rect x="5" y="3.5" width="14" height="17.5" rx="1.5"/><path d="M9 3.5V2h6v1.5M8.5 9.5l1.5 1.5 3-3M8.5 15.5h7"/>',
    freedom: '<path d="M2.5 18.5h19"/><path d="M5 18.5a7 7 0 0 1 14 0"/><path d="M12 6.5V4M6.3 8.8 4.6 7.1M17.7 8.8l1.7-1.7M3.5 14H2M22 14h-1.5"/><path d="M8 21.5h8"/>',
    issues: '<path d="M14.5 5.5a4 4 0 0 0-5.3 5.1L3.5 16.3v4.2h4.2l5.7-5.7a4 4 0 0 0 5.1-5.3l-2.8 2.8-2.6-.6-.6-2.6Z"/><path d="M16 17.5h4.5M18.25 15.25v4.5"/>',
    dungeon: '<path d="M4 20.5V9l2-1.5L8 9V6.5L10 5l2 1.5L14 5l2 1.5V9l2-1.5L20 9v11.5Z"/><path d="M10 20.5v-4a2 2 0 0 1 4 0v4M7 12h.01M17 12h.01"/>',
    flock: '<path d="M7 20.5h10M9 20.5l1-3M15 20.5l-1-3"/><path d="M6 11.5a6 6 0 0 0 12 0c0-2-1-3.5-2.5-4.5l1-3-3 1.5A5 5 0 0 0 8 8.5c-1.3 1-2 2-2 3Z"/><path d="M14.5 9h.01M18 8.5l2.5.5-2.5 1"/>',
    insurance: '<path d="M3 12a9 9 0 0 1 18 0Z"/><path d="M12 3v1M12 12v6.5a2 2 0 0 1-4 0"/>',
    security: '<path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6Z"/><circle cx="12" cy="11" r="2.6"/><path d="M12 8.4V7M12 15v-1.4"/>',
    business: '<path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z"/><path d="M9 7.5h6M9 11h6M9 14.5h4"/>',
    power: '<rect x="3" y="7.5" width="16" height="9" rx="1.5"/><path d="M21 10.5v3M7 10v4M10.5 10v4"/>',
    observations: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    relationships: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.4A6 6 0 0 1 21 20"/>',
    notes: '<path d="M6 3.5h9l3.5 3.5v13.5H6Z"/><path d="M15 3.5V7h3.5M9 11h6M9 14.5h6M9 18h4"/>',
    classroom: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5Z"/><path d="M6.5 11v4.5c1.6 1.6 3.4 2.4 5.5 2.4s3.9-.8 5.5-2.4V11M21.5 9v5"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"/><path d="M3.5 13.5H8.5l1.2 2.5h4.6l1.2-2.5h5"/>',
    expeditions: '<path d="M12 4 2.5 20h19Z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
    memories: '<rect x="3" y="6.5" width="18" height="13" rx="1.5"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/><circle cx="12" cy="13" r="3.5"/>',
    maps: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z"/><path d="M9 4v13.5M15 6.5V20"/>',
    navigation: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8Z"/>',
    knowledge: '<path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2Z"/><path d="M4 20.5a2 2 0 0 1 2-2h13v2.5H6"/>',
    toolbox: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M9 8V5.5h6V8M3 13h18M10 13v2h4v-2"/>',
    lab: '<path d="M9.5 3.5h5M10.5 3.5v6L4.8 18.6A1.5 1.5 0 0 0 6.1 21h11.8a1.5 1.5 0 0 0 1.3-2.4L13.5 9.5v-6"/><path d="M7.5 15h9"/>',
    field_kit: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 8h3v3H8ZM13 13h3v3h-3ZM11 9.5h4.5V13M8 11v5h5"/>',
    files: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2.5h7.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z"/>',
    music: '<path d="M9 18V5.5l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
    diagnostics: '<path d="M2.5 12h4l2.5-6 4 12 2.5-6h6"/>',
    plan: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    income: '<path d="M12 3v11M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15.5V20h16v-4.5"/>',
    bills: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    debt: '<path d="M3 6.5 9.5 13l4-4 7.5 7.5"/><path d="M21 11.5v5h-5"/>',
    vault: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v-1M12 16.5v-1M15.5 12h1M7.5 12h1M6 19.5v1.5M18 19.5v1.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    journal: '<path d="M6 3.5h11.5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6Z"/><path d="M6 3.5v17M9.5 8h6M9.5 11.5h6"/>',
    model: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  };
  const ALIAS = { web_home: "mia", module_browser: "apps", voice: "mic", quick_add: "plus", add: "plus", budget_card: "budget" };

  function name(id) { return ALIAS[id] || id; }
  function has(id) { return Object.prototype.hasOwnProperty.call(P, name(id)); }
  function svg(id) {
    if (!has(id)) return null;
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "1.6");
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    node.innerHTML = P[name(id)];
    return node;
  }
  /** Swap a header badge's emoji for the app's line icon (keeps the emoji if there's no icon). */
  function badge(node, id) {
    const icon = node && svg(id);
    if (icon) node.replaceChildren(icon);
  }
  window.MIAIcons = { svg, has, badge };
})();
