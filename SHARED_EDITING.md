# Shared Document Editing Feature

This document describes the modifications made to enable collaborative editing for shared documents by all users, including unregistered/anonymous users.

## Overview

Previously, shared documents in Docmost were read-only. With these changes, anyone with access to a shared document link can now edit the document in real-time, similar to public collaboration features in tools like Google Docs.

## Changes Made

### Backend Changes

#### 1. New Public Authentication Extension
**File**: `apps/server/src/collaboration/extensions/public-authentication.extension.ts`

- Created a new authentication extension specifically for shared pages
- Allows anonymous users to connect and edit shared documents
- Automatically generates anonymous user IDs for collaboration
- Checks if a page is shared before allowing access

#### 2. Public Collaboration Gateway
**File**: `apps/server/src/collaboration/public-collaboration.gateway.ts`

- New WebSocket gateway for handling public/anonymous collaboration
- Uses the same Hocuspocus server configuration but with public authentication
- Maintains real-time synchronization for anonymous users

#### 3. Updated Collaboration Module
**File**: `apps/server/src/collaboration/collaboration.module.ts`

- Added support for a new WebSocket endpoint `/collab-public` for shared pages
- Maintains the original `/collab` endpoint for authenticated users
- Both endpoints can run simultaneously without conflicts

#### 4. WebSocket Adapter Updates
**File**: `apps/server/src/collaboration/adapter/collab-ws.adapter.ts`

- Modified to properly handle multiple WebSocket paths
- Prevents conflicts between authenticated and public collaboration endpoints

### Frontend Changes

#### 1. Shared Page Editor Component
**File**: `apps/client/src/features/editor/shared-page-editor.tsx`

- New editor component specifically for shared pages
- Connects to the public collaboration endpoint (`/collab-public`)
- Enables full editing capabilities for anonymous users
- Assigns random colors to anonymous collaborators for cursor visibility

#### 2. Updated Shared Page Component
**File**: `apps/client/src/pages/share/shared-page.tsx`

- Replaced `ReadonlyPageEditor` with the new `SharedPageEditor`
- Added `TitleEditor` to allow title editing
- Maintains all existing SEO and branding features

## How It Works

1. **Sharing a Document**: When a user shares a document, it generates a unique share link
2. **Anonymous Access**: Anyone with the link can access the document without authentication
3. **Real-time Collaboration**: Multiple anonymous users can edit simultaneously
4. **Persistence**: All changes are saved to the database through the persistence extension
5. **Conflict Resolution**: Uses Yjs for automatic conflict resolution in concurrent edits

## Security Considerations

- Only explicitly shared pages can be edited anonymously
- The system checks if a page is shared before allowing public access
- Anonymous users cannot access non-shared pages
- All edits are still tracked in the database

## Usage

1. **Share a document**: Use the existing share functionality to generate a public link
2. **Access the link**: Anyone can open the shared link in their browser
3. **Start editing**: The document is immediately editable without any login required
4. **Collaborate**: Multiple users can edit simultaneously with real-time updates

## Testing

To test the feature:

1. Build and run the Docker image with the new code:
   ```bash
   ./build-local-image.sh
   docker-compose -f docker-compose.local.yml up -d
   ```

2. Create and share a document through the regular interface
3. Open the shared link in an incognito/private browser window
4. Verify that you can edit the document without logging in
5. Open the same link in multiple browsers to test real-time collaboration

## Rollback

If you need to revert to read-only shared documents:

1. Replace the `SharedPageEditor` import in `shared-page.tsx` with `ReadonlyPageEditor`
2. Remove the public collaboration gateway and authentication extension
3. Remove the `/collab-public` endpoint from the collaboration module

## Future Enhancements

- Add option to make shared documents read-only or editable
- Implement anonymous user nicknames
- Add edit history tracking for anonymous users
- Rate limiting for anonymous edits
- Optional password protection for shared documents

