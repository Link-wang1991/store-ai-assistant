/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cleanDistDir: false,
  // pdf-parse / mammoth 等在服务端运行，放进外部包避免被打包进 edge
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "xlsx", "officeparser", "ffmpeg-static"],
    // 知识库支持更大文件上传（Server Action 默认仅 1MB）
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
