import React, { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import { useDebouncedCallback } from "@mantine/hooks";
import api from "@/lib/api-client";

interface SimpleSharedEditorProps {
  pageId: string;
  content: any;
}

export default function SimpleSharedEditor({
  pageId,
  content,
}: SimpleSharedEditorProps) {
  const saveContent = async (newContent: any) => {
    try {
      await api.post("/shares/update-content", {
        pageId: pageId,
        content: newContent,
      });
    } catch (error) {
      console.error("Failed to save content:", error);
    }
  };

  const debouncedSave = useDebouncedCallback((content: any) => {
    saveContent(content);
  }, 2000);

  const editor = useEditor({
    extensions: mainExtensions,
    content: content,
    editable: true,
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON());
    },
  });

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content, false);
    }
  }, [editor, content]);

  return <EditorContent editor={editor} />;
}



