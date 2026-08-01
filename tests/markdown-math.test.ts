import { describe, expect, it } from 'vitest';
import { containsMarkdownMath } from '../src/lib/markdown-math';

describe('containsMarkdownMath', () => {
  it('ignores content without double-dollar math', () => {
    expect(containsMarkdownMath('')).toBe(false);
    expect(containsMarkdownMath('Plain markdown without math.')).toBe(false);
    expect(containsMarkdownMath('Inline single dollar $x$ is disabled.')).toBe(false);
    expect(containsMarkdownMath('The price is $12 and the variable is $name.')).toBe(false);
    expect(containsMarkdownMath('This text mentions $$ as plain delimiters.')).toBe(false);
    expect(containsMarkdownMath('Empty delimiters are not math: $$ $$.')).toBe(false);
    expect(containsMarkdownMath('<span class="math-inline">x + y</span>')).toBe(false);
    expect(containsMarkdownMath('<pre><code class="language-math">x + y</code></pre>')).toBe(false);
  });

  it('ignores double-dollar markers in fenced and inline code', () => {
    expect(
      containsMarkdownMath(
        ['```md', 'The literal formula $$x + y$$ stays in a fenced code block.', '```'].join('\n')
      )
    ).toBe(false);
    expect(
      containsMarkdownMath(
        ['~~~txt', '$$', 'x + y', '$$', '~~~', 'Outside code has no math.'].join('\n')
      )
    ).toBe(false);
    expect(containsMarkdownMath(['```math', 'x + y', '```'].join('\n'))).toBe(false);
    expect(containsMarkdownMath('Inline code `$$x + y$$` is not rendered math.')).toBe(false);
  });

  it('ignores double-dollar markers in top-level indented code blocks', () => {
    expect(containsMarkdownMath('    $$x + y$$\n')).toBe(false);
    expect(containsMarkdownMath(['Paragraph', '', '    $$x + y$$'].join('\n'))).toBe(false);
  });

  it('ignores escaped double-dollar delimiters', () => {
    expect(containsMarkdownMath('Escaped opening delimiter: \\$$x + y$$')).toBe(false);
    expect(containsMarkdownMath('Escaped closing delimiter: $$x + y\\$$')).toBe(false);
  });

  it('detects inline double-dollar math', () => {
    expect(containsMarkdownMath('Euler identity: $$e^{i\\pi} + 1 = 0$$.')).toBe(true);
  });

  it('detects single-line block double-dollar math', () => {
    expect(containsMarkdownMath(['Before', '$$x^2 + y^2 = z^2$$', 'After'].join('\n'))).toBe(true);
  });

  it('detects double-dollar math in indented list continuation text', () => {
    expect(containsMarkdownMath(['- Item', '', '    $$x + y$$'].join('\n'))).toBe(true);
  });

  it('detects multiline block double-dollar math', () => {
    expect(
      containsMarkdownMath(
        ['Before', '$$', '\\int_0^1 x^2\\,dx = \\frac{1}{3}', '\\\\', 'a^2 + b^2 = c^2', '$$', 'After'].join(
          '\n'
        )
      )
    ).toBe(true);
  });
});
