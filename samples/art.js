// Shared line-art illustrations for the design samples (blobs + ink lines).
const INK = '#33302E';
export const art = {
  bookQuill: (coral = '#C95F48', salmon = '#EDA597', size = 260) => `
<svg viewBox="0 0 300 260" width="${size}" height="${size * 260 / 300}" aria-hidden="true">
  <path d="M168 30c48-8 96 22 98 72 2 46-34 66-30 106 3 30-40 44-74 30-40-16-50-44-86-52-40-9-56-48-34-82 24-38 80-66 126-74Z" fill="${coral}"/>
  <circle cx="92" cy="150" r="62" fill="${salmon}" opacity=".9"/>
  <g fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M60 196c34-14 66-14 92 6 26-20 58-20 92-6V96c-34-14-66-14-92 6-26-20-58-20-92-6v100Z" fill="#FBF7EF"/>
    <path d="M152 102v100"/>
    <path d="M76 118c20-6 40-6 60 2M76 136c20-6 40-6 60 2M76 154c16-5 30-5 44 0M168 120c20-8 40-8 60-2M168 138c20-8 40-8 60-2M168 156c14-5 28-5 42-2"/>
    <path d="M214 30c-30 22-48 52-54 92 34-10 58-40 64-86l-10-6Z" fill="#FBF7EF"/>
    <path d="M160 122c14-28 30-52 50-74M178 84l14 4M188 66l12 3"/>
  </g>
  <g fill="${INK}"><circle cx="248" cy="58" r="2.4"/><circle cx="262" cy="84" r="1.6"/><circle cx="44" cy="92" r="2"/><circle cx="36" cy="208" r="1.6"/></g>
  <g stroke="${INK}" stroke-width="2.6" stroke-linecap="round"><path d="M236 22l-6 12M252 28l-12 8M226 14l0 12"/></g>
</svg>`,
  logo: (coral = '#C95F48') => `<svg viewBox="0 0 44 28" width="44" height="28" aria-hidden="true"><g stroke-linecap="round" stroke-width="3.4">
    <path d="M3 10v8" stroke="${INK}"/><path d="M10 6v16" stroke="${INK}"/><path d="M17 11v6" stroke="${coral}"/><path d="M24 3v22" stroke="${INK}"/><path d="M31 8v12" stroke="${coral}"/><path d="M38 12v4" stroke="${INK}"/></g></svg>`,
};
