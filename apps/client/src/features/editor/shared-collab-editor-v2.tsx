import "@/features/editor/styles/index.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  HocuspocusProvider,
  WebSocketStatus,
} from "@hocuspocus/provider";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  collabExtensions,
  mainExtensions,
} from "@/features/editor/extensions/extensions";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler.tsx";
import api from "@/lib/api-client";

interface SharedCollabEditorV2Props {
  pageId: string;
  content: any;
}

const userColors = [
  "#958DF1", "#F98181", "#FBBC88", "#FAF594", "#70CFF8", "#94FADB",
  "#B9F18D", "#C3E2C2", "#AFC8AD", "#EEC759", "#9BB8CD", "#FF90BC",
];

const randomElement = (array: string[]): string => {
  return array[Math.floor(Math.random() * array.length)];
};

// Collaborative editor with proper initialization sequence
const SharedCollabEditorV2 = React.memo(function SharedCollabEditorV2({
  pageId,
  content,
}: SharedCollabEditorV2Props) {
  console.log('[SharedCollabEditorV2] Initializing with:', { pageId, hasContent: !!content });
  
  const collaborationURL = useCollaborationUrl();
  const menuContainerRef = useRef(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const documentName = `page.${pageId}`;
  
  // Create Y.Doc instance once
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;

  // Create anonymous user once
  const anonymousUser = useMemo(() => {
    const sessionId = Math.random().toString(36).substr(2, 9);
    return {
      id: `anon-${sessionId}`,
      name: `Anonymous ${sessionId}`,
      email: '',
      avatarUrl: '',
      color: randomElement(userColors),
    };
  }, []);

  // Step 1: Get public collaboration token
  useEffect(() => {
    console.log('[SharedCollabEditorV2] Fetching public collab token for pageId:', pageId);
    let cancelled = false;
    
    const getPublicToken = async () => {
      try {
        const response = await api.post("/shares/public-collab-token", { pageId });
        if (!cancelled) {
          console.log('[SharedCollabEditorV2] Received token');
          setPublicToken(response.data.token);
        }
      } catch (error) {
        console.error("[SharedCollabEditorV2] Failed to get public collab token:", error);
      }
    };
    
    getPublicToken();
    
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Step 2: Create providers when token is ready
  useEffect(() => {
    if (!publicToken) {
      return;
    }

    console.log('[SharedCollabEditorV2] Setting up collaboration provider');
    
    // Create local IndexedDB provider
    const localProvider = new IndexeddbPersistence(documentName, ydoc);
    
    // Create remote Hocuspocus provider
    const remoteProvider = new HocuspocusProvider({
      name: documentName,
      url: collaborationURL,
      document: ydoc,
      token: publicToken,
      connect: true,
      preserveConnection: true,
      onStatus: (status) => {
        console.log("[SharedCollabEditorV2] WebSocket status:", status.status);
        setIsConnected(status.status === WebSocketStatus.Connected);
      },
      onSynced: () => {
        console.log('[SharedCollabEditorV2] Document synced with server');
      },
    });
    
    setProvider(remoteProvider);
    
    // Cleanup
    return () => {
      console.log('[SharedCollabEditorV2] Cleaning up providers');
      localProvider?.destroy();
      remoteProvider?.destroy();
    };
  }, [publicToken, documentName, ydoc, collaborationURL]);

  // Step 3: Create editor extensions with provider
  const extensions = useMemo(() => {
    if (!provider) {
      // Use basic extensions without collaboration while provider is loading
      return mainExtensions;
    }
    // Add collaboration extensions when provider is ready
    return [
      ...mainExtensions,
      ...collabExtensions(provider, anonymousUser as any),
    ];
  }, [provider, anonymousUser]);

  // Step 4: Create editor with proper extensions
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions,
    editable: true,
    content: !provider ? content : undefined, // Only set initial content if no provider
    onCreate: ({ editor }) => {
      console.log('[SharedCollabEditorV2] Editor created, provider:', !!provider);
      // Focus editor after creation
      setTimeout(() => {
        editor.commands.focus("start");
      }, 100);
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
  }, [extensions]); // Re-create editor when extensions change

  // Debug logging
  console.log('[SharedCollabEditorV2] Render state:', { 
    hasEditor: !!editor, 
    hasToken: !!publicToken,
    hasProvider: !!provider,
    isConnected
  });

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  if (!isConnected && provider) {
    return (
      <div>
        <div style={{ marginBottom: '1rem', color: '#666' }}>
          Connecting to collaboration server...
        </div>
        <div className="editor-container" style={{ position: "relative" }}>
          <div ref={menuContainerRef}>
            <EditorContent editor={editor} />
            <EditorBubbleMenu editor={editor} />
          </div>
          <div style={{ paddingBottom: "20vh" }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container" style={{ position: "relative" }}>
      {isConnected && (
        <div style={{ 
          position: 'absolute', 
          top: -30, 
          right: 0, 
          fontSize: '12px', 
          color: '#4CAF50',
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <span style={{ 
            width: '8px', 
            height: '8px', 
            backgroundColor: '#4CAF50', 
            borderRadius: '50%',
            display: 'inline-block'
          }}></span>
          Connected • Real-time collaboration active
        </div>
      )}
      <div ref={menuContainerRef}>
        <EditorContent editor={editor} />
        <EditorBubbleMenu editor={editor} />
      </div>
      <div style={{ paddingBottom: "20vh" }}></div>
    </div>
  );
});

export default SharedCollabEditorV2;
