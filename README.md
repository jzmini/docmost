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

### 🔓 License-Free Features
- **Removed all Enterprise Edition restrictions** - all features are available without a license
- **No trial mode limitations** - full functionality without upgrade prompts
- **Confluence import** and other EE features enabled by default

### 🛠️ UI/UX Improvements
- **Edit button on shared pages** - allows viewers to quickly login and edit
- **Smart redirect after login** - automatically returns to the page you were viewing
- **Email change capability** for user profiles
- **Improved member search** in spaces (case-insensitive, supports LDAP usernames)
- **Fixed clipboard copy** functionality for sharing links

### 🐛 Bug Fixes
- Fixed Docker build to support mirror registries
- Fixed public page sharing display issues
- Fixed LDAP group synchronization removing users incorrectly
- Fixed authentication isolation between local and LDAP users

### 🏗️ Technical Changes
- Rebased on upstream main branch (includes all updates up to v0.23.2)
- Database migrations for LDAP support
- Removed license validation code
- Enhanced error handling for authentication

## Getting started

To get started with this enhanced version of Docmost, please refer to the original [documentation](https://docmost.com/docs).

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

**Note**: While this fork removes license restrictions for functionality, it respects the original licensing terms. Users should review the original Docmost licensing for compliance.

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Thanks
Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.


<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.

