// Small ink line drawings over coral and blush shapes (v4 cream theme).
const INK = '#3A3633';
const PAPER = '#FCF8F1';
const CORAL = '#D0654A';
const BLUSH = '#EFB3A3';

const dots = points => points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${INK}"/>`).join('');

/** A fountain pen writing a line, for Today. */
export function penArt(className = 'art') {
  return `<svg class="${className}" viewBox="0 0 200 200" aria-hidden="true">
    <path d="M38 118 C28 80 66 58 94 72 C120 86 108 126 136 142 C162 158 124 192 86 182 C52 172 46 148 38 118 Z" fill="${BLUSH}"/>
    <circle cx="128" cy="80" r="44" fill="${CORAL}" style="mix-blend-mode:multiply"/>
    <g stroke="${INK}" stroke-width="2.2" stroke-linecap="round" fill="none">
      <path d="M44 46 l-8 -10 M54 40 l-2 -13 M33 58 l-12 -4"/>
      <path d="M131 139 c6 6 10 -8 16 -2 s4 10 10 2 s6 -8 12 0 s6 6 14 -2"/>
    </g>
    <g transform="rotate(-38 100 100)">
      <rect x="92" y="18" width="18" height="90" rx="9" fill="${PAPER}" stroke="${INK}" stroke-width="2.4"/>
      <path d="M104 30 v62" stroke="${INK}" stroke-width="1.6"/>
      <path d="M96 40 h4 M96 48 h4 M96 56 h4 M96 64 h4 M96 72 h4 M96 80 h4" stroke="${INK}" stroke-width="1.2"/>
      <rect x="92" y="98" width="18" height="10" fill="${INK}"/>
      <path d="M93 108 L101 150 L109 108 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M101 122 v24" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="101" cy="120" r="2.4" fill="${INK}"/>
    </g>
    ${dots([[150, 40], [162, 52], [70, 170], [60, 160], [176, 120], [30, 96], [118, 30]])}
  </svg>`;
}

/** An open book with a coral ribbon, for the library and new learning. */
export function bookArt(className = 'art') {
  return `<svg class="${className}" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="72" cy="78" r="44" fill="${CORAL}"/>
    <path d="M110 60 C150 44 186 74 176 110 C168 140 130 150 112 128 C96 108 84 72 110 60 Z" fill="${BLUSH}" style="mix-blend-mode:multiply"/>
    <g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M100 74 C80 62 50 62 28 70 L28 154 C50 146 80 146 100 158 Z" fill="${PAPER}"/>
      <path d="M100 74 C120 62 150 62 172 70 L172 154 C150 146 120 146 100 158 Z" fill="${PAPER}"/>
      <path d="M28 154 L28 162 C50 154 80 154 100 166 C120 154 150 154 172 162 L172 154" fill="none"/>
    </g>
    <g stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none">
      <path d="M40 88 C56 83 74 83 88 88 M40 100 C56 95 74 95 88 100 M40 112 C56 107 70 107 80 111 M40 124 C56 119 74 119 88 124"/>
      <path d="M112 88 C126 83 140 83 152 86 M112 100 C126 95 144 95 160 100 M112 112 C126 107 144 107 160 112"/>
      <path d="M36 172 l8 -4 M52 176 l8 -4 M140 176 l8 -4 M156 172 l8 -4"/>
    </g>
    <path d="M140 64 v44 l-7 -7 l-7 7 v-44" fill="${CORAL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    ${dots([[30, 40], [44, 30], [170, 40], [186, 150], [16, 120]])}
  </svg>`;
}

/** A speech bubble with a quotation mark and a laurel sprig, for finished sessions. */
export function bubbleArt(className = 'art') {
  const leaves = [[160, 150, -30], [170, 136, -60], [152, 162, 10], [176, 120, -80], [166, 124, 20], [158, 140, 40]]
    .map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.2" transform="rotate(${a} ${x} ${y})" fill="${PAPER}" stroke="${INK}" stroke-width="1.8"/>`).join('');
  return `<svg class="${className}" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="134" cy="66" r="42" fill="${CORAL}"/>
    <path d="M20 128 C14 96 46 82 70 94 C96 106 92 150 64 166 C40 178 24 156 20 128 Z" fill="${BLUSH}" style="mix-blend-mode:multiply"/>
    <path d="M36 58 Q36 34 60 34 H140 Q164 34 164 58 V106 Q164 130 140 130 H88 L60 156 L66 130 H60 Q36 130 36 106 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M58 92 c0 -12 8 -20 16 -22 l2 5 c-5 2 -8 6 -8 11 h8 v16 h-18 Z M84 92 c0 -12 8 -20 16 -22 l2 5 c-5 2 -8 6 -8 11 h8 v16 h-18 Z" fill="${INK}"/>
    <g stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><path d="M112 62 H146 M112 76 H140 M112 90 H146 M112 104 H130"/></g>
    <path d="M146 176 C160 160 172 140 174 112" fill="none" stroke="${INK}" stroke-width="2"/>
    ${leaves}
    ${dots([[24, 40], [186, 96], [110, 180], [98, 170], [180, 30]])}
  </svg>`;
}

/** The brand mark: five rounded bars, two in coral. */
export const LOGO = `<svg class="logo-mark" viewBox="0 0 30 22" aria-hidden="true"><rect x="0" y="7" width="3.4" height="8" rx="1.7" fill="${INK}"/><rect x="6" y="3" width="3.4" height="16" rx="1.7" fill="${INK}"/><rect x="12" y="8" width="3.4" height="6" rx="1.7" fill="${CORAL}"/><rect x="18" y="0" width="3.4" height="22" rx="1.7" fill="${CORAL}"/><rect x="24" y="5" width="3.4" height="12" rx="1.7" fill="${INK}"/></svg>`;
