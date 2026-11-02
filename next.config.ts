import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 資料匯入需要上傳 Excel 檔
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
