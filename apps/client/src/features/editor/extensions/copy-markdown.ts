import { Extension } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { htmlToMarkdown } from "@/features/editor/utils/turndown-client";

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    copyMarkdown: {
      /**
       * Copy selected content as Markdown
       */
      copyAsMarkdown: () => ReturnType,
    }
  }
}

export const CopyMarkdownExtension = Extension.create({
  name: "copyMarkdown",

  addCommands() {
    return {
      copyAsMarkdown: () => ({ editor, state }) => {
        const { from, to } = state.selection;
        const selectedContent = state.doc.slice(from, to);
        
        if (selectedContent.content.size === 0) {
          return false;
        }
        
        // Create a temporary document with the selected content
        const tempDoc = state.schema.topNodeType.create(null, selectedContent.content);
        
        // Get HTML from the temporary document
        const div = document.createElement('div');
        const fragment = DOMSerializer.fromSchema(state.schema).serializeFragment(tempDoc.content);
        div.appendChild(fragment);
        
        // Convert HTML to Markdown
        const markdown = htmlToMarkdown(div.innerHTML);
        
        // Copy to clipboard
        navigator.clipboard.writeText(markdown).then(() => {
          // Show a notification if you want
          const event = new CustomEvent('markdownCopied', { detail: { markdown } });
          document.dispatchEvent(event);
        }).catch(err => {
          console.error('Failed to copy markdown:', err);
        });
        
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-c': () => this.editor.commands.copyAsMarkdown(),
      'Mod-Alt-c': () => this.editor.commands.copyAsMarkdown(),
    };
  },
});
