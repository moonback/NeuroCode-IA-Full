import { AnimatePresence, motion } from 'framer-motion';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ProgressAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [progressList, setProgressList] = useState<ProgressAnnotation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [autoCollapseTimer, setAutoCollapseTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Process progress data more efficiently
  useEffect(() => {
    if (!data || data.length === 0) {
      setProgressList([]);
      return;
    }

    const progressMap = new Map<string, ProgressAnnotation>();
    data.forEach((x) => {
      const existingProgress = progressMap.get(x.label);

      if (existingProgress && existingProgress.status === 'complete') {
        return;
      }

      progressMap.set(x.label, x);
    });

    const newData = Array.from(progressMap.values());
    newData.sort((a, b) => a.order - b.order);
    setProgressList(newData);
    
    // Auto-expand when new data arrives
    if (newData.length > 0 && newData.some(item => item.status === 'in-progress')) {
      setExpanded(true);
      
      // Clear any existing timer
      if (autoCollapseTimer) {
        clearTimeout(autoCollapseTimer);
        setAutoCollapseTimer(null);
      }
    }
  }, [data, autoCollapseTimer]);
  
  // Check if all items are complete and set auto-collapse timer
  useEffect(() => {
    if (progressList.length > 0 && expanded) {
      const allComplete = progressList.every(item => item.status === 'complete');
      
      if (allComplete) {
        // Set timer to auto-collapse after 3 seconds
        const timer = setTimeout(() => {
          setExpanded(false);
        }, 3000);
        
        setAutoCollapseTimer(timer);
        
        // Cleanup function
        return () => {
          clearTimeout(timer);
          setAutoCollapseTimer(null);
        };
      }
    }
  }, [progressList, expanded]);

  // Memoize derived values
  const hasProgress = useMemo(() => progressList.length > 0, [progressList]);
  const latestProgress = useMemo(() => 
    progressList.length > 0 ? progressList.slice(-1)[0] : null, 
    [progressList]
  );
  
  // Optimize toggle function
  const toggleExpanded = useCallback(() => {
    // Clear auto-collapse timer when manually toggled
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
      setAutoCollapseTimer(null);
    }
    setExpanded(prev => !prev);
  }, [autoCollapseTimer]);

  if (!hasProgress) {
    return null;
  }

  // Calculate if all items are complete for styling
  const allComplete = progressList.every(item => item.status === 'complete');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 0.9, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={{ duration: 0.2, ease: cubicEasingFn }}
        className={classNames(
          'bg-bolt-elements-background-depth-1/70',
          'border border-bolt-elements-borderColor/30',
          'shadow-sm rounded-md relative w-full max-w-chat mx-auto z-prompt',
          ' mb-0 px-1 py-1',
          allComplete ? 'border-violet-500/30' : ''
        )}
      >
        <div
          className={classNames(
            'bg-bolt-elements-item-backgroundAccent/30',
            'p-1 rounded-md text-bolt-elements-item-contentAccent/90',
            'flex items-center',
          )}
        >
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {expanded ? (
                <motion.div
                  className="progress-items space-y-1"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: cubicEasingFn }}
                >
                  {progressList.map((progress, i) => (
                    <ProgressItem 
                      key={`${progress.label}-${i}`} 
                      progress={progress} 
                      isFirst={i === 0}
                      isLast={i === progressList.length - 1}
                    />
                  ))}
                </motion.div>
              ) : latestProgress && (
                <ProgressItem progress={latestProgress} isLast={true} />
              )}
            </AnimatePresence>
          </div>
          <motion.button
            aria-label={expanded ? "Collapse progress details" : "Expand progress details"}
            title={expanded ? "Hide details" : "Show all steps"}
            initial={{ scale: 1 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1, ease: cubicEasingFn }}
            className={classNames(
              "p-1 ml-1 rounded-md bg-transparent focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColor/50 text-xs",
              "hover:bg-bolt-elements-artifacts-backgroundHover/30",
              autoCollapseTimer ? "animate-pulse" : ""
            )}
            onClick={toggleExpanded}
          >
            <div className={expanded ? 'i-ph:caret-up' : 'i-ph:caret-down'}></div>
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

type ProgressItemProps = {
  progress: ProgressAnnotation;
  isFirst?: boolean;
  isLast?: boolean;
};

const ProgressItem = ({ progress, isFirst, isLast }: ProgressItemProps) => {
  if (!progress) return null;
  
  return (
    <motion.div
      className={classNames(
        'flex text-xs gap-2 items-center',
        isFirst ? 'pt-0' : '',
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-1">
        <div className="text-sm">
          {progress.status === 'in-progress' ? (
            <div className="i-svg-spinners:90-ring-with-bg text-blue-400/70" aria-label="In progress" />
          ) : progress.status === 'complete' ? (
            <div className="i-ph:check text-green-500/70" aria-label="Complete" />
          ) : (
            <div className="i-ph:info text-gray-400/70" aria-label="Info" />
          )}
        </div>
        <span className={classNames(
          'text-bolt-elements-item-contentAccent/80',
          isLast ? 'font-medium' : 'font-normal'
        )}>
          {progress.label}
        </span>
      </div>
      <div className={classNames(
        'flex-1',
        'text-white/80'
      )}>
        {progress.message}
      </div>
    </motion.div>
  );
};
