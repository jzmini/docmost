import TurndownService from '@joplin/turndown';
import * as TurndownPluginGfm from '@joplin/turndown-plugin-gfm';

export function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    hr: '---',
    bulletListMarker: '-',
  });

  const tables = TurndownPluginGfm.tables;
  const strikethrough = TurndownPluginGfm.strikethrough;
  const highlightedCodeBlock = TurndownPluginGfm.highlightedCodeBlock;

  turndownService.use([
    tables,
    strikethrough,
    highlightedCodeBlock,
  ]);

  // Add custom rules for Docmost specific elements
  addCustomRules(turndownService);

  return turndownService;
}

function addCustomRules(turndownService: TurndownService) {
  // Task list items
  turndownService.addRule('taskListItem', {
    filter: function (node: HTMLElement) {
      return (
        node.getAttribute('data-type') === 'taskItem' &&
        node.parentNode?.nodeName === 'UL'
      );
    },
    replacement: function (content: string, node: HTMLElement) {
      const checkbox = node.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement;
      const isChecked = checkbox?.checked || false;
      
      // Process content like regular list items
      content = content
        .replace(/^\n+/, '') // remove leading newlines
        .replace(/\n+$/, '\n') // replace trailing newlines with just a single one
        .replace(/\n/gm, '\n  '); // indent nested content with 2 spaces
      
      // Create the checkbox prefix
      const prefix = `- ${isChecked ? '[x]' : '[ ]'} `;
      
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });

  // Callout blocks
  turndownService.addRule('callout', {
    filter: function (node: HTMLElement) {
      return (
        node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout'
      );
    },
    replacement: function (content: string, node: HTMLElement) {
      const calloutType = node.getAttribute('data-callout-type') || 'info';
      return `\n\n:::${calloutType}\n${content.trim()}\n:::\n\n`;
    },
  });

  // Math inline
  turndownService.addRule('mathInline', {
    filter: function (node: HTMLElement) {
      return (
        node.nodeName === 'SPAN' &&
        node.getAttribute('data-type') === 'mathInline'
      );
    },
    replacement: function (content: string) {
      return `$${content}$`;
    },
  });

  // Math block
  turndownService.addRule('mathBlock', {
    filter: function (node: HTMLElement) {
      return (
        node.nodeName === 'DIV' &&
        node.getAttribute('data-type') === 'mathBlock'
      );
    },
    replacement: function (content: string) {
      return `\n$$\n${content}\n$$\n`;
    },
  });

  // Details/Summary (collapsible sections)
  turndownService.addRule('preserveDetail', {
    filter: function (node: HTMLElement) {
      return node.nodeName === 'DETAILS';
    },
    replacement: function (content: string, node: HTMLElement) {
      const summary = node.querySelector(':scope > summary');
      let detailSummary = '';

      if (summary) {
        detailSummary = `<summary>${turndownService.turndown(summary.innerHTML)}</summary>`;
      }

      const detailsContent = Array.from(node.childNodes)
        .filter((child) => child.nodeName !== 'SUMMARY')
        .map((child) =>
          child.nodeType === 1
            ? turndownService.turndown((child as HTMLElement).outerHTML)
            : child.textContent || ''
        )
        .join('');

      return `\n<details>\n${detailSummary}\n\n${detailsContent}\n\n</details>\n`;
    },
  });

  // List paragraphs
  turndownService.addRule('paragraph', {
    filter: ['p'],
    replacement: function(content: string, node: HTMLElement) {
      if (node.parentElement?.nodeName === 'LI') {
        return content;
      }
      return `\n\n${content}\n\n`;
    },
  });

  // Video elements
  turndownService.addRule('video', {
    filter: function (node: HTMLElement) {
      return node.tagName === 'VIDEO';
    },
    replacement: function (content: string, node: HTMLElement) {
      const src = node.getAttribute('src') || '';
      const name = src.split('/').pop() || 'video';
      return `[${name}](${src})`;
    },
  });

  // Iframe embeds
  turndownService.addRule('iframeEmbed', {
    filter: function (node: HTMLElement) {
      return node.nodeName === 'IFRAME';
    },
    replacement: function (content: string, node: HTMLElement) {
      const src = node.getAttribute('src') || '';
      return `[${src}](${src})`;
    },
  });
}

export function htmlToMarkdown(html: string): string {
  const turndownService = createTurndownService();
  return turndownService.turndown(html).replaceAll('<br>', ' ');
}




