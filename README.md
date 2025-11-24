<div align="center">
    <h1><b>Docmost (Enhanced Fork)</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <strong>This is an enhanced fork of <a href="https://github.com/docmost/docmost">Docmost</a></strong>
        <br />
        <a href="https://docmost.com"><strong>Original Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Fork Enhancements

This fork includes the following enhancements over the original Docmost v0.23.2:

### 🔐 LDAP Integration
- **Full LDAP/Active Directory support** with authentication and group synchronization
- **Auto-provisioning of users** from LDAP groups (configurable)
- **Unified login UI** with dropdown selector for Local DB and LDAP authentication
- **LDAP group sync** that automatically manages group membership
- **Improved user search** supporting LDAP usernames and email addresses

### ✨ Editor Enhancements
- **WYSIWYG Toolbar** - Rich visual editing toolbar for better user experience
  - Text formatting (Bold, Italic, Underline, Strikethrough)
  - Headings (H1, H2, H3) with easy dropdown selection
  - Lists (Bullet, Numbered, Task/Checkbox)
  - Insert menu for Media (Images, Videos, Files), Diagrams (Excalidraw, Draw.io, Mermaid), and Embeds
  - Table operations and formatting options
  - Text alignment and color controls
  - Undo/Redo buttons for quick editing
  
- **Copy as Markdown** - Right-click on selected content to copy as Markdown format
  - Preserves formatting, links, and structure
  - Useful for exporting content to other Markdown-compatible tools
  
- **Enhanced Media Upload** - Seamless image, video, and file insertion
  - Click-to-upload interface with file picker dialog
  - Inline preview and display of uploaded media
  - Support for authenticated media endpoints with proper credential handling

### 🛠️ UI/UX Improvements
- **Edit button on shared pages** - allows viewers to quickly login and edit
- **Smart redirect after login** - automatically returns to the page you were viewing
- **Email change capability** for user profiles
- **Improved member search** in spaces (case-insensitive, supports LDAP usernames)
- **Fixed clipboard copy** functionality for sharing links
- **Fixed toolbar width** issues in the editor

### 🐛 Stability & Compatibility Improvements
- Enhanced public page sharing reliability
- Improved LDAP group synchronization accuracy
- Better authentication isolation between local and LDAP users
- Optimized media loading with proper credential management

### 🏗️ Developer Experience
- **Easy local builds** with `build-local-image.sh` script for custom Docker images
- **Mirror registry support** for building behind corporate firewalls
- **Based on Docmost v0.23.2** with all upstream features and updates
- **Enhanced API handling** for cleaner file upload integration
- **Improved TypeScript types** for better development experience

## Getting started

To get started with this enhanced version of Docmost, please refer to the original [documentation](https://docmost.com/docs).

### Building from Source

#### Using `build-local-image.sh`

The `build-local-image.sh` script allows you to build a local Docker image from source code instead of using the official Docker Hub image. This is particularly useful for:
- Testing your modifications
- Building for specific platforms (ARM64, AMD64)
- Creating custom deployments
- Working behind corporate firewalls with mirror registries

**Basic usage:**
```bash
# Build with default settings (creates docmost/docmost:local)
./build-local-image.sh

# Build with custom tag
./build-local-image.sh --tag v1.0.0

# Build without cache (useful after making changes)
./build-local-image.sh --no-cache

# Build for specific platform
./build-local-image.sh --platform linux/arm64

# Build with verbose output for debugging
./build-local-image.sh --verbose
```

**Available options:**
- `-h, --help` - Show help message
- `-t, --tag TAG` - Custom tag for the image (default: local)
- `-n, --name NAME` - Custom image name (default: docmost/docmost)
- `-c, --no-cache` - Build without using Docker cache
- `-p, --platform PLATFORM` - Target platform (e.g., linux/amd64, linux/arm64)
- `-v, --verbose` - Show detailed build output
- `--push` - Push the image to registry after building
- `--clean` - Remove existing local image before building

After building, update your `docker-compose.yml` to use the local image:
```yaml
services:
  docmost:
    image: docmost/docmost:local  # Instead of docmost/docmost:latest
```

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License

This fork maintains the same licensing as the original Docmost:
- Core features are licensed under the open-source AGPL 3.0 license
- Original Enterprise Edition features remain under their respective licenses

**Note**: This fork respects the original licensing terms. Users should review the original Docmost licensing for compliance.

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.

