import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * COOP/COEP headers required for SharedArrayBuffer support.
   * SharedArrayBuffer is needed by the sherpa-onnx WASM runtime
   * for multi-threaded inference. Using 'credentialless' for COEP
   * to avoid blocking legitimate cross-origin resources.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
      {
        source: "/sherpa-onnx/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  /**
   * Turbopack configuration (Next.js 16 default bundler).
   * Empty config silences the webpack-vs-turbopack warning.
   * The sherpa-onnx WASM files are loaded from /public via
   * dynamic <script> injection, so no special bundler config needed.
   */
  turbopack: {},
};

export default nextConfig;
