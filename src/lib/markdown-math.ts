type MarkdownFence = {
  marker: '`' | '~';
  length: number;
};

const countRepeated = (source: string, index: number, marker: string): number => {
  let count = 0;
  while (source[index + count] === marker) {
    count += 1;
  }
  return count;
};

const countPreviousBackslashes = (source: string, index: number): number => {
  let count = 0;
  let cursor = index - 1;
  while (cursor >= 0 && source[cursor] === '\\') {
    count += 1;
    cursor -= 1;
  }
  return count;
};

const isEscaped = (source: string, index: number): boolean => countPreviousBackslashes(source, index) % 2 === 1;

const getLineBreak = (line: string): string => {
  const match = line.match(/(\r\n|\n|\r)$/);
  return match?.[0] ?? '';
};

const blankLineContent = (line: string): string => {
  const lineBreak = getLineBreak(line);
  const contentLength = line.length - lineBreak.length;
  return `${' '.repeat(contentLength)}${lineBreak}`;
};

const getFenceFromLine = (line: string): MarkdownFence | null => {
  let index = 0;
  while (index < line.length && line[index] === ' ' && index < 4) {
    index += 1;
  }
  if (index > 3) return null;

  const marker = line[index];
  if (marker !== '`' && marker !== '~') return null;

  const length = countRepeated(line, index, marker);
  if (length < 3) return null;

  return { marker, length };
};

const isBlankLineContent = (line: string): boolean => line.trim().length === 0;

const isIndentedCodeLine = (line: string): boolean => /^(?: {4}|\t)/.test(line);

const isListItemLine = (line: string | null): boolean =>
  line !== null && /^(?: {0,3})(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.test(line);

const isClosingFenceLine = (line: string, fence: MarkdownFence): boolean => {
  let index = 0;
  while (index < line.length && line[index] === ' ' && index < 4) {
    index += 1;
  }
  if (index > 3 || line[index] !== fence.marker) return false;

  const length = countRepeated(line, index, fence.marker);
  if (length < fence.length) return false;

  return line.slice(index + length).trim().length === 0;
};

const stripMarkdownCode = (source: string): string => {
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter((line) => line.length > 0) ?? [];
  let fence: MarkdownFence | null = null;
  let inIndentedCodeBlock = false;
  let previousLineWasBlank = true;
  let previousNonBlankContent: string | null = null;

  return lines
    .map((line) => {
      const lineBreak = getLineBreak(line);
      const content = lineBreak ? line.slice(0, -lineBreak.length) : line;
      const isBlank = isBlankLineContent(content);

      if (fence) {
        if (isClosingFenceLine(content, fence)) {
          fence = null;
        }
        previousLineWasBlank = false;
        if (!isBlank) previousNonBlankContent = content;
        return blankLineContent(line);
      }

      const nextFence = getFenceFromLine(content);
      if (nextFence) {
        fence = nextFence;
        inIndentedCodeBlock = false;
        previousLineWasBlank = false;
        previousNonBlankContent = content;
        return blankLineContent(line);
      }

      const startsIndentedCodeBlock =
        isIndentedCodeLine(content)
        && (inIndentedCodeBlock || (previousLineWasBlank && !isListItemLine(previousNonBlankContent)));
      if (startsIndentedCodeBlock || (inIndentedCodeBlock && isBlank)) {
        inIndentedCodeBlock = true;
        previousLineWasBlank = isBlank;
        if (!isBlank) previousNonBlankContent = content;
        return blankLineContent(line);
      }

      inIndentedCodeBlock = false;
      previousLineWasBlank = isBlank;
      if (!isBlank) previousNonBlankContent = content;

      return line;
    })
    .join('');
};

const findClosingBacktickRun = (source: string, startIndex: number, length: number): number => {
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] !== '`' || isEscaped(source, index)) continue;
    const runLength = countRepeated(source, index, '`');
    if (runLength === length) return index;
    index += Math.max(0, runLength - 1);
  }
  return -1;
};

const findClosingMathDelimiter = (source: string, startIndex: number): number => {
  for (let index = startIndex; index < source.length - 1; index += 1) {
    const char = source[index];

    if (char === '`' && !isEscaped(source, index)) {
      const runLength = countRepeated(source, index, '`');
      const closingIndex = findClosingBacktickRun(source, index + runLength, runLength);
      if (closingIndex >= 0) {
        index = closingIndex + runLength - 1;
      } else {
        index += runLength - 1;
      }
      continue;
    }

    if (char === '$' && source[index + 1] === '$' && !isEscaped(source, index)) {
      return index;
    }
  }

  return -1;
};

export const containsMarkdownMath = (source: string): boolean => {
  if (!source.includes('$$')) return false;

  const searchableSource = stripMarkdownCode(source);

  for (let index = 0; index < searchableSource.length - 1; index += 1) {
    const char = searchableSource[index];

    if (char === '`' && !isEscaped(searchableSource, index)) {
      const runLength = countRepeated(searchableSource, index, '`');
      const closingIndex = findClosingBacktickRun(searchableSource, index + runLength, runLength);
      if (closingIndex >= 0) {
        index = closingIndex + runLength - 1;
      } else {
        index += runLength - 1;
      }
      continue;
    }

    if (char !== '$' || searchableSource[index + 1] !== '$' || isEscaped(searchableSource, index)) {
      continue;
    }

    const closingIndex = findClosingMathDelimiter(searchableSource, index + 2);
    if (closingIndex < 0) {
      index += 1;
      continue;
    }

    const content = searchableSource.slice(index + 2, closingIndex);
    if (content.trim().length > 0) return true;

    index = closingIndex + 1;
  }

  return false;
};
