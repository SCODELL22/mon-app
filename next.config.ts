import type { NextConfig } from 'next';

// public/pipeline.html s'appuie sur un gros <script> inline et des attributs onclick/onchange
// inline (pas de build step React pour cette page) : script-src doit donc garder 'unsafe-inline'.
// Passer à une CSP stricte (nonce/hash) demanderait de rendre cette page côté serveur au lieu de
// la servir en fichier statique. Le reste de la police (connect/img/frame/base/object/form) est
// verrouillé : ça bloque l'exfiltration réseau et le clickjacking même si un XSS venait à passer.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/pipeline.html' }],
    };
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
