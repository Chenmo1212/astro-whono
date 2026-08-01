import type {
  MarkdownCalloutType,
  MarkdownHeadingLevel,
  MarkdownInsertPlacement,
  MarkdownToolbarCommand,
  MarkdownToolId
} from './markdown-tools';

type MarkdownCommandDispatcherOptions = {
  isBusy: () => boolean;
  onCommand: (command: MarkdownToolbarCommand) => void;
};

export type MarkdownCommandDispatcher = {
  applyCallout: (calloutType: MarkdownCalloutType) => void;
  applyHeading: (level: MarkdownHeadingLevel) => void;
  applyTool: (toolId: MarkdownToolId) => void;
  insertText: (text: string, placement?: MarkdownInsertPlacement) => void;
  replaceText: (range: { from: number; to: number }, text: string, placement?: MarkdownInsertPlacement) => void;
};

export const createMarkdownCommandDispatcher = ({
  isBusy,
  onCommand
}: MarkdownCommandDispatcherOptions): MarkdownCommandDispatcher => {
  let commandId = 0;

  const nextCommandId = () => {
    commandId += 1;
    return commandId;
  };

  return {
    applyCallout: (calloutType) => {
      if (isBusy()) return;
      onCommand({ id: nextCommandId(), kind: 'callout', calloutType });
    },
    applyHeading: (level) => {
      if (isBusy()) return;
      onCommand({ id: nextCommandId(), kind: 'heading', level });
    },
    applyTool: (toolId) => {
      if (isBusy()) return;
      onCommand({ id: nextCommandId(), kind: 'tool', toolId });
    },
    insertText: (text, placement) => {
      if (isBusy()) return;
      onCommand({
        id: nextCommandId(),
        kind: 'insert',
        text,
        ...(placement ? { placement } : {})
      });
    },
    replaceText: (range, text, placement) => {
      if (isBusy()) return;
      onCommand({
        id: nextCommandId(),
        kind: 'replace',
        from: range.from,
        to: range.to,
        text,
        ...(placement ? { placement } : {})
      });
    }
  };
};
