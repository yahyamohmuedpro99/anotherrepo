/** Line icons (24×24, stroke = currentColor), merged from both prototypes. */
export const SCARAB_SVG =
  '<svg class="scarab" viewBox="0 0 24 28" aria-hidden="true"><path class="lg" d="M6.5 11 3 8.5M6 16H2.5M7 21l-3 3M17.5 11 21 8.5M18 16h3.5M17 21l3 3"/><path class="sh" d="M8.6 7.4a3.4 3.1 0 0 1 6.8 0z"/><ellipse class="sb" cx="12" cy="16.4" rx="6" ry="8.3"/><path class="sm" d="M12 8.6v16.2"/></svg>';

export const ICONS: Record<string, string> = {
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .1 5.5 1.9 5.5 4.8"/>',
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V14c0 4-2.8 7-6.8 7-2.6 0-4.3-1-5.7-3L5 14.2a1.5 1.5 0 0 1 2.3-1.9L8 13"/>',
  star: '<path d="M12 3l1.9 5.6H20l-4.9 3.6 1.9 5.8L12 14.4 7 18l1.9-5.8L4 8.6h6.1z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  camel: '<path d="M3 19v-6c0-2 1.4-3.6 3.4-3.6 1.4 0 1.7-2.6 3.6-2.6 2 0 2.4 2.8 4 2.8 1.2 0 1.5-3.6 3.5-3.6h1.5l1.5 2-1.8.5V19M6.5 19v-5M14.5 19v-5"/>',
  carriage: '<circle cx="9" cy="15.5" r="4.5"/><path d="M9 11v9M4.5 15.5h9M5 9.5c2-4 8-4 10 0M13.5 15.5H20l1-4"/>',
  balloon: '<path d="M12 3a6.5 6.5 0 0 0-6.5 6.5c0 3.6 3.5 6.3 5 8h3c1.5-1.7 5-4.4 5-8A6.5 6.5 0 0 0 12 3z"/><path d="M12 3c-2 2-2.6 4.2-2.6 6.5s1 5.6 1.6 8M12 3c2 2 2.6 4.2 2.6 6.5s-1 5.6-1.6 8M10.5 17.5v2.5h3v-2.5"/>',
  cartouche: '<rect x="7" y="2.5" width="10" height="16" rx="5"/><path d="M6 21h12M10 7.5h4M10 11h4M10 14.5h4"/>',
  tea: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2 2 0 0 1 0 4H16M9 3c-1 1.5 1 2.5 0 4M12.5 3c-1 1.5 1 2.5 0 4"/>',
  ring: '<ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v4.5M12 16.5V21M9.5 5.5 12 3l2.5 2.5"/>',
  talk: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  exit: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.8 2.5-5 .2 1.8 1 2.6 2 3 0-3 .5-5.5.5-8z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><circle cx="12" cy="8.5" r="2"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  rocket: '<path d="M12 3c3 2 5 5.5 5 9.5L15 16H9l-2-3.5C7 8.5 9 5 12 3z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4M15 16l2 4M12 16v4"/>',
  galaxy: '<path d="M12 12c0-3 2.5-5 5.5-4.5M12 12c3 0 5 2.5 4.5 5.5M12 12c0 3-2.5 5-5.5 4.5M12 12c-3 0-5-2.5-4.5-5.5"/><circle cx="12" cy="12" r="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  telescope: '<path d="M4 15 17 8l2 4-13 7zM9 17l-2 4M11 16l2 5"/>',
};

export function icon(k: string | undefined): string {
  if (!k) return '';
  if (k === 'scarab') return SCARAB_SVG;
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] ?? ICONS.star}</svg>`;
}
