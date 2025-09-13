import "@/features/editor/styles/index.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler.tsx";

interface SharedCollabEditorStableProps {
  pageId: string;
  content: any;
}

// Simplified version without real-time collaboration for now
// This ensures the page loads and displays content without errors
const SharedCollabEditorStable = React.memo(function SharedCollabEditorStable({
  pageId,
  content,
}: SharedCollabEditorStableProps) {
  console.log('[SharedCollabEditorStable] Initializing with:', { pageId, hasContent: !!content });
  
  const menuContainerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: mainExtensions,
      editable: true,
      content: content || '',
      onCreate: ({ editor }) => {
        console.log('[SharedCollabEditorStable] Editor created');
        setIsReady(true);
      },
      onUpdate: ({ editor }) => {
        editor.view.dom.classList.add("ProseMirror-content");
      },
      editorProps: {
        handlePaste: (view, event, slice) => {
          return handlePaste(view, event, pageId);
        },
        handleDrop: (view, event, slice, moved) => {
          return handleFileDrop(view, event, moved, pageId);
        },
      },
    },
    [] // Empty deps to create editor only once
  );

  useEffect(() => {
    if (editor && isReady) {
      setTimeout(() => {
        editor.commands.focus("start");
      }, 100);
    }
  }, [editor, isReady]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="editor-container" style={{ position: "relative" }}>
      <div ref={menuContainerRef}>
        <EditorContent editor={editor} />
        <EditorBubbleMenu editor={editor} />
      </div>
      <div style={{ paddingBottom: "20vh" }}></div>
    </div>
  );
});

export default SharedCollabEditorStable;
