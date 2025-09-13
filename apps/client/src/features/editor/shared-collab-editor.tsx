import "@/features/editor/styles/index.css";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

interface SharedCollabEditorProps {
  pageId: string;
  content: any;
}

const userColors = [
  "#958DF1",
  "#F98181",
  "#FBBC88",
  "#FAF594",
  "#70CFF8",
  "#94FADB",
  "#B9F18D",
  "#C3E2C2",
  "#AFC8AD",
  "#EEC759",
  "#9BB8CD",
  "#FF90BC",
];

// Helper function to get random element from array
const randomElement = (array: string[]): string => {
  return array[Math.floor(Math.random() * array.length)];
};

// Memoize the component to prevent unnecessary re-renders
const SharedCollabEditor = React.memo(function SharedCollabEditor({
  pageId,
  content,
}: SharedCollabEditorProps) {
  console.log('[SharedCollabEditor] Initializing with:', { pageId, hasContent: !!content });
  
  const collaborationURL = useCollaborationUrl();
  console.log('[SharedCollabEditor] Collaboration URL:', collaborationURL);
  
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;
  const [isLocalSynced, setLocalSynced] = useState(false);
  const [isRemoteSynced, setRemoteSynced] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const documentName = `page.${pageId}`;
  const menuContainerRef = useRef(null);

  // Providers only created once per pageId
  const providersRef = useRef<{
    local: IndexeddbPersistence;
    remote: HocuspocusProvider;
  } | null>(null);
  const [providersReady, setProvidersReady] = useState(false);

  const localProvider = providersRef.current?.local;
  const remoteProvider = providersRef.current?.remote;

  // Track when collaborative provider is ready and synced
  const [collabReady, setCollabReady] = useState(false);
  useEffect(() => {
    if (
      remoteProvider?.status === WebSocketStatus.Connected &&
      isLocalSynced &&
      isRemoteSynced
    ) {
      setCollabReady(true);
    }
  }, [remoteProvider?.status, isLocalSynced, isRemoteSynced]);

  // Get public collaboration token for anonymous users on shared pages
  useEffect(() => {
    console.log('[SharedCollabEditor] Fetching public collab token for pageId:', pageId);
    const getPublicToken = async () => {
      try {
        const response = await api.post("/shares/public-collab-token", { pageId });
        console.log('[SharedCollabEditor] Received token:', response.data.token ? 'Token received' : 'No token');
        setPublicToken(response.data.token);
      } catch (error) {
        console.error("[SharedCollabEditor] Failed to get public collab token:", error);
      }
    };
    getPublicToken();
  }, [pageId]);

  useEffect(() => {
    console.log('[SharedCollabEditor] Provider setup check:', { hasProviders: !!providersRef.current, hasToken: !!publicToken });
    
    if (!providersRef.current && publicToken) {
      console.log('[SharedCollabEditor] Setting up providers with token');
      
      const local = new IndexeddbPersistence(documentName, ydoc);
      local.on("synced", () => {
        console.log('[SharedCollabEditor] Local provider synced');
        setLocalSynced(true);
      });
      
      const remote = new HocuspocusProvider({
        name: documentName,
        url: collaborationURL,
        document: ydoc,
        token: publicToken,
        connect: true,
        preserveConnection: false,
        onStatus: (status) => {
          console.log("[SharedCollabEditor] WebSocket status:", status.status);
        },
        onSynced: () => {
          console.log('[SharedCollabEditor] Remote provider synced');
        },
      });
      remote.on("synced", () => setRemoteSynced(true));

      providersRef.current = { local, remote };
      setProvidersReady(true);
      console.log('[SharedCollabEditor] Providers ready');
    }

    return () => {
      if (providersRef.current) {
        console.log('[SharedCollabEditor] Cleaning up providers');
        providersRef.current.local?.destroy();
        providersRef.current.remote?.destroy();
        providersRef.current = null;
      }
    };
  }, [publicToken, documentName, ydoc, collaborationURL]);

  // Create a minimal anonymous user object for collaboration
  const anonymousUser = useMemo(() => {
    // Generate a unique session ID for this user
    const sessionId = Math.random().toString(36).substr(2, 9);
    return {
      id: `anon-${sessionId}`,
      name: `Anonymous ${sessionId}`,
      email: '',
      avatarUrl: '',
      color: randomElement(userColors),
    };
  }, []);

  const extensions = useMemo(() => {
    if (!remoteProvider) {
      return mainExtensions;
    }
    return [
      ...mainExtensions,
      ...collabExtensions(remoteProvider, anonymousUser as any),
    ];
  }, [remoteProvider, anonymousUser]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions,
      editable: true,
      onCreate: ({ editor }) => {
        console.log('[SharedCollabEditor] Editor created, isLocalSynced:', isLocalSynced);
        if (!isLocalSynced) {
          if (content) {
            console.log('[SharedCollabEditor] Setting initial content');
            editor.commands.setContent(content);
          } else {
            console.log('[SharedCollabEditor] No initial content to set');
          }
        }
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
    [isLocalSynced, extensions, pageId]
  );
  
  console.log('[SharedCollabEditor] Editor state:', { 
    hasEditor: !!editor, 
    hasToken: !!publicToken,
    isLocalSynced,
    isRemoteSynced,
    providersReady
  });

  useEffect(() => {
    if (editor && providersReady) {
      setTimeout(() => {
        editor.commands.focus("start");
      }, 100);
    }
  }, [editor, providersReady]);

  if (!editor || !publicToken) {
    return <div>Loading collaborative editor...</div>;
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

export default SharedCollabEditor;
