import { useParams } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import * as Dialog from '@radix-ui/react-dialog';
import { type ChatHistoryItem } from '~/lib/persistence';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { forwardRef, type ForwardedRef } from 'react';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onDuplicate?: (id: string) => void;
  exportChat: (id?: string) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}

export function HistoryItem({ item, onDelete, onDuplicate, exportChat, isSelectionMode, isSelected, onSelect }: HistoryItemProps) {
  const { id: urlId } = useParams();
  const isActiveChat = urlId === item.urlId;

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription: item.description,
      customChatId: item.id,
      syncWithGlobalStore: isActiveChat,
    });

  return (
    <div
      className={classNames(
        'group rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/80 dark:hover:bg-gray-800/80 overflow-hidden flex justify-between items-center px-3 py-2 transition-colors',
        isActiveChat ? 'text-gray-900 dark:text-white bg-gray-50/80 dark:bg-gray-800/30' : '',
        isSelected ? 'bg-purple-50/50 dark:bg-purple-500/10' : ''
      )}
    >
      {isSelectionMode && (
        <div className="flex items-center mr-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect?.(item.id)}
            className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      )}
      {editing ? (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="i-ph:check h-4 w-4 text-gray-500 hover:text-purple-500 transition-colors"
            onMouseDown={handleSubmit}
          />
        </form>
      ) : (
        <a href={`/chat/${item.urlId}`} className="flex w-full relative truncate block">
          <WithTooltip tooltip={currentDescription}>
            <span className="truncate pr-24">{currentDescription}</span>
          </WithTooltip>
          <div
            className={classNames(
              'absolute right-0 top-0 bottom-0 flex items-center bg-white dark:bg-gray-950 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/30 px-2',
              { 
                'bg-gray-50/80 dark:bg-gray-900/10': isActiveChat,
                'bg-purple-50/50 dark:bg-purple-500/0': isSelected ?? false // Add this line to handle the selected state
              },
            )}
          >
            <div className="flex items-center gap-2.5 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChatActionButton
                toolTipContent="Exporter"
                icon="i-ph:download-simple h-4 w-4"
                onClick={(event) => {
                  event.preventDefault();
                  exportChat(item.id);
                }}
              />
              {onDuplicate && (
                <ChatActionButton
                  toolTipContent="Dupliquer"
                  icon="i-ph:copy h-4 w-4"
                  onClick={() => onDuplicate?.(item.id)}
                />
              )}
              <ChatActionButton
                toolTipContent="Renommer"
                icon="i-ph:pencil-fill h-4 w-4"
                onClick={(event) => {
                  event.preventDefault();
                  toggleEditMode();
                }}
              />
              <Dialog.Trigger asChild>
                <ChatActionButton
                  toolTipContent="Supprimer"
                  icon="i-ph:trash h-4 w-4"
                  className="hover:text-red-500"
                  onClick={(event) => {
                    event.preventDefault();
                    onDelete?.(event);
                  }}
                />
              </Dialog.Trigger>
            </div>
          </div>
        </a>
      )}
    </div>
  );
}

const ChatActionButton = forwardRef(
  (
    {
      toolTipContent,
      icon,
      className,
      onClick,
    }: {
      toolTipContent: string;
      icon: string;
      className?: string;
      onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
      btnTitle?: string;
    },
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    return (
      <WithTooltip tooltip={toolTipContent} position="bottom" sideOffset={4}>
        <button
          ref={ref}
          type="button"
          className={`text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors ${icon} ${className ? className : ''}`}
          onClick={onClick}
        />
      </WithTooltip>
    );
  },
);
