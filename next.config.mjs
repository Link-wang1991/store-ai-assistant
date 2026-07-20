/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cleanDistDir: false,
  // 服务端二进制/解析依赖不参与 RSC 打包。
  serverExternalPackages: ["pdf-parse", "mammoth", "read-excel-file", "officeparser", "ffmpeg-static"],
  // pdf-parse / mammoth 等在服务端运行，放进外部包避免被打包进 edge
  experimental: {
    // 知识库支持更大文件上传（Server Action 默认仅 1MB）
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
