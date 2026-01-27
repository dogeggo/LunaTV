// 图片占位符组件 - 实现骨架屏效果（支持暗色模式）
const ImagePlaceholder = ({ aspectRatio }: { aspectRatio: string }) => (
  <div
    className={`skeleton-shimmer w-full ${aspectRatio} rounded-lg pointer-events-none select-none`}
  />
);

export { ImagePlaceholder };
