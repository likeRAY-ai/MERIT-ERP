import type { MetadataRoute } from "next";

// 讓手機可以「加入主畫面」當作 App 使用
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MERIT ERP",
    short_name: "MERIT",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#0f766e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
