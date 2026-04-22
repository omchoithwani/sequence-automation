// Shared HTML fragments — Tailwind CDN config, top nav, and footer

export const TAILWIND_SETUP = `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script>
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-variant": "#f4ded9",
        "on-primary-fixed-variant": "#862208",
        "surface-container-highest": "#f4ded9",
        "on-primary": "#ffffff",
        "on-tertiary-container": "#00403c",
        "on-secondary": "#ffffff",
        "surface": "#fff8f6",
        "surface-container-low": "#fff1ed",
        "on-surface-variant": "#58423c",
        "surface-container-lowest": "#ffffff",
        "inverse-primary": "#ffb4a2",
        "on-surface": "#241916",
        "on-primary-container": "#701500",
        "surface-dim": "#ebd5d0",
        "tertiary": "#006a64",
        "surface-tint": "#a7391e",
        "primary-fixed-dim": "#ffb4a2",
        "inverse-on-surface": "#ffede9",
        "background": "#fff8f6",
        "surface-bright": "#fff8f6",
        "on-error": "#ffffff",
        "on-secondary-container": "#5e6473",
        "tertiary-container": "#00b5ab",
        "on-tertiary": "#ffffff",
        "error": "#ba1a1a",
        "primary": "#a7391e",
        "error-container": "#ffdad6",
        "surface-container-high": "#fae3de",
        "primary-fixed": "#ffdad2",
        "surface-container": "#ffe9e4",
        "on-background": "#241916",
        "outline": "#8b716b",
        "inverse-surface": "#3b2d2a",
        "secondary": "#585e6c",
        "secondary-container": "#dde2f3",
        "outline-variant": "#dfc0b8",
        "primary-container": "#ff7a59"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "stack-gap": "16px",
        "card-padding": "24px",
        "unit": "4px",
        "container-max": "1280px",
        "margin-page": "32px",
        "gutter": "24px"
      },
      fontFamily: {
        "body-sm": ["Inter"],
        "label-caps": ["Inter"],
        "h2": ["Inter"],
        "h3": ["Inter"],
        "h1": ["Inter"],
        "button-text": ["Inter"],
        "body-base": ["Inter"]
      },
      fontSize: {
        "body-sm": ["13px", {"lineHeight": "1.5", "letterSpacing": "0", "fontWeight": "400"}],
        "label-caps": ["11px", {"lineHeight": "1", "letterSpacing": "0.05em", "fontWeight": "600"}],
        "h2": ["24px", {"lineHeight": "1.3", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "h3": ["18px", {"lineHeight": "1.4", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "h1": ["32px", {"lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "600"}],
        "button-text": ["14px", {"lineHeight": "1", "letterSpacing": "0", "fontWeight": "500"}],
        "body-base": ["14px", {"lineHeight": "1.6", "letterSpacing": "0", "fontWeight": "400"}]
      }
    }
  }
}
</script>`;

export function topNav(activePage?: 'landing' | 'pricing' | 'dashboard'): string {
  const link = (label: string, href: string, active: boolean) =>
    `<a class="text-white ${active ? 'opacity-100 border-b-2 border-[#ff7a59] pb-1' : 'opacity-70 hover:opacity-100'} hover:text-white transition-all duration-200" href="${href}">${label}</a>`;
  return `<header class="bg-[#1a202c] sticky top-0 z-50 w-full border-b border-slate-800 shadow-sm font-['Inter'] text-sm font-medium tracking-tight">
<div class="flex justify-between items-center w-full px-8 h-16 max-w-[1280px] mx-auto">
  <div class="flex items-center gap-8">
    <a class="text-xl font-black text-white hover:opacity-100 transition-all duration-200" href="/">Flow Enroll</a>
    <nav class="hidden md:flex items-center gap-6">
      ${link('Landing', '/', activePage === 'landing')}
      ${link('Pricing', '/pricing', activePage === 'pricing')}
      ${link('Dashboard', '/dashboard', activePage === 'dashboard')}
    </nav>
  </div>
  <div class="flex items-center gap-4">
    <a class="text-white opacity-70 hover:opacity-100 hover:text-white transition-all duration-200" href="mailto:support@flowenroll.io">Support</a>
  </div>
</div>
</header>`;
}

export const FOOTER = `<footer class="bg-white border-t border-slate-200 mt-auto">
<div class="flex flex-col md:flex-row justify-between items-center px-8 py-10 w-full max-w-[1280px] mx-auto gap-4 font-['Inter'] text-xs text-slate-500">
  <div class="flex items-center gap-2">
    <span class="text-sm font-bold text-slate-900">Flow Enroll</span>
    <span>© 2026 Flow Enroll. All rights reserved.</span>
  </div>
  <nav class="flex flex-wrap items-center gap-6">
    <a class="text-slate-500 hover:text-[#ff7a59] transition-colors" href="#">Privacy Policy</a>
    <a class="text-slate-500 hover:text-[#ff7a59] transition-colors" href="#">Terms of Service</a>
    <a class="text-slate-500 hover:text-[#ff7a59] transition-colors" href="#">API Status</a>
    <a class="text-slate-500 hover:text-[#ff7a59] transition-colors" href="#">Security</a>
  </nav>
</div>
</footer>`;
