import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useAtom } from "jotai";
import { pageEditorAtom, yjsConnectionStatusAtom } from "@/features/editor/atoms/editor-atoms";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { activeCommentIdAtom, showCommentPopupAtom } from "@/features/comment/atoms/comment-atom";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { extractPageSlugId } from "@/lib";
import { useParams } from "react-router-dom";
import { getAppUrl } from "@/lib/config";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import CommentDialog from "@/features/comment/components/comment-dialog";

interface SharedPageEditorProps {
  pageId: string;
  content: any;
}

export default function SharedPageEditor({
  pageId,
  content,
}: SharedPageEditorProps) {
  console.log('[SHARED-EDITOR] Initializing with:', { pageId, hasContent: !!content });
  
  const [, setEditor] = useAtom(pageEditorAtom);
  const [, setAsideState] = useAtom(asideStateAtom);
  const [, setActiveCommentId] = useAtom(activeCommentIdAtom);
  const [showCommentPopup, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const menuContainerRef = useRef(null);
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  
  // Add back the missing state variables
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;
  const [isLocalSynced, setLocalSynced] = useState(false);
  const [isRemoteSynced, setRemoteSynced] = useState(false);
  const [yjsConnectionStatus, setYjsConnectionStatus] = useAtom(yjsConnectionStatusAtom);
  const documentName = `page.${pageId}`;
  const [isCollabReady, setIsCollabReady] = useState(false);

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
  }, [isLocalSynced, isRemoteSynced, remoteProvider?.status]);

  // Get public collaboration URL
  const getPublicCollaborationUrl = () => {
    const baseUrl = getAppUrl();
    const collabUrl = new URL("/collab-public", baseUrl);
    collabUrl.protocol = collabUrl.protocol === "https:" ? "wss:" : "ws:";
    const url = collabUrl.toString();
    console.log('[SHARED-EDITOR] Public collab URL:', url);
    return url;
  };

  useEffect(() => {
    if (!providersRef.current) {
      const local = new IndexeddbPersistence(documentName, ydoc);
      local.on("synced", () => setLocalSynced(true));
      
      // Create public collaboration provider without authentication
      console.log('[SHARED-EDITOR] Creating HocuspocusProvider for:', documentName);
      const remote = new HocuspocusProvider({
        name: documentName,
        url: getPublicCollaborationUrl(),
        document: ydoc,
        token: "public", // Dummy token for public access
        connect: true,
        preserveConnection: false,
        onStatus: (status) => {
          console.log('[SHARED-EDITOR] WebSocket status:', status.status);
          if (status.status === "connected") {
            setYjsConnectionStatus(status.status);
          }
        },
        onConnect: () => {
          console.log('[SHARED-EDITOR] WebSocket connected');
        },
        onDisconnect: () => {
          console.log('[SHARED-EDITOR] WebSocket disconnected');
        },
        onAuthenticationFailed: (error) => {
          console.error('[SHARED-EDITOR] WebSocket auth failed:', error);
        },
      });
      
      remote.on("synced", () => setRemoteSynced(true));
      remote.on("disconnect", () => {
        setYjsConnectionStatus(WebSocketStatus.Disconnected);
      });
      
      providersRef.current = { local, remote };
      setProvidersReady(true);
    } else {
      setProvidersReady(true);
    }
    
    // Only destroy on final unmount
    return () => {
      providersRef.current?.remote.destroy();
      providersRef.current?.local.destroy();
      providersRef.current = null;
    };
  }, [pageId]);

  // Keep providers connected based on various conditions
  useEffect(() => {
    if (!remoteProvider) return;

    const shouldConnect = true; // Always keep connected for shared pages
    
    if (shouldConnect && remoteProvider.status === WebSocketStatus.Disconnected) {
      remoteProvider.connect();
    } else if (!shouldConnect && remoteProvider.status === WebSocketStatus.Connected) {
      remoteProvider.disconnect();
    }
  }, [remoteProvider]);

  // Extensions with collaboration enabled
  const extensions = useMemo(() => {
    if (!providersReady) return mainExtensions;
    
    return [
      ...mainExtensions,
      Collaboration.configure({
        document: ydoc,
        field: "default",
      }),
      CollaborationCursor.configure({
        provider: remoteProvider,
        user: {
          name: "Anonymous User " + Math.floor(Math.random() * 1000),
          color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        },
      }),
    ];
  }, [providersReady, ydoc, remoteProvider]);

  // Create editor with useEditor hook
  const editor = useEditor({
    extensions,
    content,
    editable: true,
    onCreate: ({ editor }) => {
      console.log('[SHARED-EDITOR] Editor created:', { 
        hasEditor: !!editor, 
        pageId, 
        slugId 
      });
      if (editor) {
        if (pageId) {
          editor.storage.pageId = pageId;
        }
        editor.storage.pageSlugId = slugId;
      }
    },
  }, [extensions, content, pageId, slugId]);

  useEffect(() => {
    if (editor) {
      // @ts-ignore
      setEditor(editor);
    }
  }, [editor, setEditor]);

  useEffect(() => {
    // Set collaborative mode as ready after a short delay
    const collabReadyTimeout = setTimeout(() => {
      if (isRemoteSynced && isLocalSynced) {
        setIsCollabReady(true);
      }
    }, 100);

    return () => clearTimeout(collabReadyTimeout);
  }, [isRemoteSynced, isLocalSynced, remoteProvider?.status]);

  // Don't render until editor is ready
  if (!editor) {
    console.log('[SHARED-EDITOR] Waiting for editor to initialize...');
    return <div>Loading editor...</div>;
  }

  console.log('[SHARED-EDITOR] Rendering editor with:', {
    hasEditor: !!editor,
    isEditable: editor?.isEditable,
    pageId
  });

  return (
    <div className="editor-container" style={{ position: "relative" }}>
      <div ref={menuContainerRef}>
        <EditorContent editor={editor} />
        
        {editor && editor.isEditable && (
          <EditorBubbleMenu editor={editor} />
        )}
        {showCommentPopup && (
          <CommentDialog editor={editor} pageId={pageId} />
        )}
      </div>
      <div style={{ paddingBottom: "20vh" }}></div>
    </div>
  );
}
