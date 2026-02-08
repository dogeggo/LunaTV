'use client';

import { X } from 'lucide-react';
import { useRef } from 'react';

import AcgSearch from '@/components/AcgSearch';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';

interface PlayNetdiskModalProps {
  open: boolean;
  videoTitle: string;
  isAnime: boolean;
  netdiskLoading: boolean;
  netdiskResults: Record<string, any[]> | null;
  netdiskError: string | null;
  netdiskTotal: number;
  netdiskResourceType: 'netdisk' | 'acg';
  acgTriggerSearch?: boolean;
  onClose: () => void;
  onSearchNetdisk: (keyword: string) => void;
  onResetNetdiskState: () => void;
  onResourceTypeChange: (next: 'netdisk' | 'acg') => void;
  onToggleAcgTrigger: () => void;
}

const PlayNetdiskModal = ({
  open,
  videoTitle,
  isAnime,
  netdiskLoading,
  netdiskResults,
  netdiskError,
  netdiskTotal,
  netdiskResourceType,
  acgTriggerSearch,
  onClose,
  onSearchNetdisk,
  onResetNetdiskState,
  onResourceTypeChange,
  onToggleAcgTrigger,
}: PlayNetdiskModalProps) => {
  const netdiskModalContentRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-9999 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4'
      onClick={onClose}
    >
      <div
        className='bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-4xl max-h-[85vh] md:max-h-[90vh] flex flex-col shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 - Fixed */}
        <div className='shrink-0 border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6'>
          <div className='flex items-center justify-between mb-3'>
            <div className='flex items-center gap-2 sm:gap-3'>
              <div className='text-2xl sm:text-3xl'>📁</div>
              <div>
                <h3 className='text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200'>
                  资源搜索
                </h3>
                {videoTitle && (
                  <p className='text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5'>
                    搜索关键词：{videoTitle}
                  </p>
                )}
              </div>
              {netdiskLoading && netdiskResourceType === 'netdisk' && (
                <span className='inline-block ml-2'>
                  <span className='inline-block h-4 w-4 sm:h-5 sm:w-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                </span>
              )}
              {netdiskTotal > 0 && netdiskResourceType === 'netdisk' && (
                <span className='inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 ml-2'>
                  {netdiskTotal} 个资源
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className='rounded-lg p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95'
              aria-label='关闭'
            >
              <X className='h-5 w-5 sm:h-6 sm:w-6 text-gray-500' />
            </button>
          </div>

          {/* 资源类型切换器 - 仅当是动漫时显示 */}
          {isAnime && (
            <div className='flex items-center gap-2'>
              <span className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>
                资源类型：
              </span>
              <div className='flex gap-2'>
                <button
                  onClick={() => {
                    onResourceTypeChange('netdisk');
                    onResetNetdiskState();
                  }}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    netdiskResourceType === 'netdisk'
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                  }`}
                >
                  💾 网盘资源
                </button>
                <button
                  onClick={() => {
                    onResourceTypeChange('acg');
                    onResetNetdiskState();
                    if (videoTitle) {
                      onToggleAcgTrigger();
                    }
                  }}
                  className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                    netdiskResourceType === 'acg'
                      ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                  }`}
                >
                  🎌 动漫磁力
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 内容区 - Scrollable */}
        <div
          ref={netdiskModalContentRef}
          className='flex-1 overflow-y-auto p-4 sm:p-6 relative'
          data-netdisk-scroll-container='true'
        >
          {/* 根据资源类型显示不同的内容 */}
          {netdiskResourceType === 'netdisk' ? (
            <>
              {videoTitle &&
                !netdiskLoading &&
                !netdiskResults &&
                !netdiskError && (
                  <div className='flex flex-col items-center justify-center py-12 sm:py-16 text-center'>
                    <div className='text-5xl sm:text-6xl mb-4'>📁</div>
                    <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
                      点击搜索按钮开始查找网盘资源
                    </p>
                    <button
                      onClick={() => onSearchNetdisk(videoTitle)}
                      disabled={netdiskLoading}
                      className='mt-4 px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 text-sm sm:text-base font-medium'
                    >
                      开始搜索
                    </button>
                  </div>
                )}

              <NetDiskSearchResults
                results={netdiskResults}
                loading={netdiskLoading}
                error={netdiskError}
                total={netdiskTotal}
              />
            </>
          ) : (
            /* ACG 动漫磁力搜索 */
            <AcgSearch
              keyword={videoTitle || ''}
              triggerSearch={acgTriggerSearch}
              onError={(error) => console.error('ACG搜索失败:', error)}
            />
          )}

          {/* 返回顶部按钮 - 统一放在外层，适用于所有资源类型 */}
          {((netdiskResourceType === 'netdisk' && netdiskTotal > 10) ||
            netdiskResourceType === 'acg') && (
            <button
              onClick={() => {
                if (netdiskModalContentRef.current) {
                  netdiskModalContentRef.current.scrollTo({
                    top: 0,
                    behavior: 'smooth',
                  });
                }
              }}
              className={`sticky bottom-6 left-full -ml-14 sm:bottom-8 sm:-ml-16 w-11 h-11 sm:w-12 sm:h-12 ${
                netdiskResourceType === 'acg'
                  ? 'bg-purple-500 hover:bg-purple-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center active:scale-95 z-50 group`}
              aria-label='返回顶部'
            >
              <svg
                className='w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-y-[-2px] transition-transform'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2.5}
                  d='M5 10l7-7m0 0l7 7m-7-7v18'
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayNetdiskModal;
