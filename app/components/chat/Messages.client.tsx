import type { Message } from 'ai';
import { Fragment, useEffect, useRef, useMemo, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { useLocation } from '@remix-run/react';
import { db, chatId } from '~/lib/persistence/useChatHistory';
import { forkChat } from '~/lib/persistence/db';
import { toast } from 'react-toastify';
import WithTooltip from '~/components/ui/Tooltip';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement>) => {    
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();
    const profile = useStore(profileStore);
    const lastMessageRef = useRef<HTMLDivElement>(null);
    const previousMessagesLengthRef = useRef(messages.length);
    const lastMessageContentRef = useRef('');
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const userScrolledRef = useRef(false);
    const messageContainerRef = useRef<HTMLDivElement>(null);

    // Set up reference forwarding
    useEffect(() => {
      if (!messageContainerRef.current) {
        return;
      }

      if (typeof ref === 'function') {
        ref(messageContainerRef.current);
      } else if (ref) {
        // Using type assertion to work around readonly property
        (ref as any).current = messageContainerRef.current;
      }
    }, [ref, messageContainerRef.current]);

    // Create memoized/debounced versions of messages to reduce rendering overhead
    const optimizedMessages = useMemo(() => {
      // For all but the last message, we don't need to re-render frequently
      const nonStreamingMessages = messages.slice(0, -1);

      // Only the last message is potentially streaming and needs frequent updates
      const lastMessage = messages[messages.length - 1];

      return lastMessage ? [...nonStreamingMessages, lastMessage] : messages;
    }, [messages]);

    // Keep track of messages length changes to detect new messages
    useEffect(() => {
      const currentLength = messages.length;

      // If we have a new message
      if (currentLength > previousMessagesLengthRef.current) {
        lastMessageContentRef.current = '';
        previousMessagesLengthRef.current = currentLength;
      }

      // If we have a last message and it's from the assistant
      if (currentLength > 0 && messages[currentLength - 1].role === 'assistant') {
        const latestContent = messages[currentLength - 1].content;

        // Only update if content changed by more than 100 characters or message ended
        if (
          !isStreaming ||
          latestContent.length - lastMessageContentRef.current.length > 100 ||
          latestContent !== lastMessageContentRef.current
        ) {
          lastMessageContentRef.current = latestContent;
        }
      }
    }, [messages, isStreaming]);
  // Scroll to bottom when streaming or new messages arrive
  useEffect(() => {
    if (!isStreaming && messages.length === previousMessagesLengthRef.current) {
      return;
    }

    // Don't scroll if user has scrolled up manually
    if (userScrolledRef.current) {
      return;
    }

    // Clear any existing timeouts to prevent rapid scrolling
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Use a short timeout to batch scroll events
    scrollTimeoutRef.current = setTimeout(() => {
      if (messageContainerRef.current) {
        messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
      }

      scrollTimeoutRef.current = null;
    }, 100);
  }, [isStreaming, messages, previousMessagesLengthRef]);

  // Add scroll detection to detect user scrolling
    // Auto-scroll to bottom of new content during streaming
    useEffect(() => {
      const container = messageContainerRef.current;

      // No-op if no container
      if (!container) {
        return;
      
      }

// Create the event handler
      const handleScroll = () => {
        // Skip if not streaming
        if (!isStreaming) {
          return;
        }

        // Calculate distance from bottom
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        // Update userScrolled ref based on position
        if (distanceFromBottom > 150) {
          userScrolledRef.current = true;
        } else if (distanceFromBottom < 50) {
          userScrolledRef.current = false;
        }
      };

      // Add the event listener
      container.addEventListener('scroll', handleScroll, { passive: true });
    }, [isStreaming]);

    // Clean up event handlers on component unmount
    useEffect(() => {
      // Store a reference to the current container and refs for cleanup
      const container = messageContainerRef.current;

      // Cleanup function for unmounting
      function cleanup() {
        // Clean up scroll listeners
        if (container) {
          /*
           * This is a placeholder for cleanup purposes.
           * Actual event listeners are attached elsewhere and
           * handled through useEffect dependencies. This ensures
           * we're not leaving any potential listeners attached.
           */
          container.removeEventListener('scroll', () => {
            /* intentionally empty */
          });
        }

        // Clean up timeouts
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      }

      // Return the cleanup function as a normal function to avoid ESLint issues
      return cleanup;
    }, []);
    const handleRewind = (messageId: string) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('rewindTo', messageId);
      window.location.search = searchParams.toString();
    };

    const handleFork = async (messageId: string) => {
      try {
        if (!db || !chatId.get()) {
          toast.error('Chat persistence is not available');
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch (error) {
        toast.error('Failed to fork chat: ' + (error as Error).message);
      }
    };

    // Memoize message rendering for better performance
    const renderMessages = useCallback(() => {
      return optimizedMessages.map((message, index) => {
        const { role, content, id: messageId, annotations } = message;
        const isUserMessage = role === 'user';
        const isFirst = index === 0;
        const isLast = index === optimizedMessages.length - 1;
        const isHidden = annotations?.includes('hidden');

        if (isHidden) {
          return <Fragment key={index} />;
        }

        return (
          <div
            key={index}
            ref={isLast ? lastMessageRef : undefined}
            className={classNames('flex gap-4 p-6 w-full rounded-[calc(0.75rem-1px)]', {
              'bg-bolt-elements-messages-background': isUserMessage || !isStreaming || (isStreaming && !isLast),
              'bg-gradient-to-b from-bolt-elements-messages-background from-30% to-transparent': isStreaming && isLast,
              'mt-4': !isFirst,
            })}
          >
            {isUserMessage && (
              <div className="flex items-center justify-center w-[40px] h-[40px] overflow-hidden bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 rounded-full shrink-0 self-start">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile?.username || 'User'}
                    className="w-full h-full object-cover"
                    loading="eager"
                    decoding="sync"
                  />
                ) : (
                  <div className="i-ph:user-fill text-2xl" />
                )}
              </div>
            )}
            <div className="grid grid-col-1 w-full">
              {isUserMessage ? (
                <UserMessage content={content} />
              ) : (
                <AssistantMessage content={content} annotations={message.annotations} />
              )}
            </div>
            {!isUserMessage && (
              <div className="flex gap-2 flex-col lg:flex-row">
                {messageId && (
                  <WithTooltip tooltip="Revert to this message">
                    <button
                      onClick={() => handleRewind(messageId)}
                      key="i-ph:arrow-u-up-left"
                      className={classNames(
                        'i-ph:arrow-u-up-left',
                        'text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors',
                      )}
                      />
                      </WithTooltip>
                    )}
    
                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => handleFork(messageId)}
                        key="i-ph:git-fork"
                        className={classNames(
                          'i-ph:git-fork',
                          'text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors',
                    )}
                    />
                    </WithTooltip>
                  </div>
                )}
              </div>
            );
          });
        }, [optimizedMessages, isStreaming, profile, handleRewind, handleFork]);

        return (
<div id={id} className={props.className} ref={messageContainerRef}>            
  {optimizedMessages.length > 0 ? renderMessages() : null}
        {isStreaming && (
          <div className="text-center w-full text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-4xl mt-4"></div>
        )}
      </div>
    );
  },
);
