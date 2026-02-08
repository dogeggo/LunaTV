'use client';

interface PlayHeaderProps {
  title: string;
  totalEpisodes: number;
  currentEpisodeIndex: number;
  currentEpisodeTitle?: string;
}

const PlayHeader = ({
  title,
  totalEpisodes,
  currentEpisodeIndex,
  currentEpisodeTitle,
}: PlayHeaderProps) => {
  return (
    <div className='py-1'>
      <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
        {title || '影片标题'}
        {totalEpisodes > 1 && (
          <span className='text-gray-500 dark:text-gray-400'>
            {` > ${currentEpisodeTitle || `第 ${currentEpisodeIndex + 1} 集`}`}
          </span>
        )}
      </h1>
    </div>
  );
};

export default PlayHeader;
