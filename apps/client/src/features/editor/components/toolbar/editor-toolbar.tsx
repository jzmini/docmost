import React, { useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Menu,
  Paper,
  Popover,
  rem,
  Select,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconCode,
  IconLink,
  IconList,
  IconListNumbers,
  IconCheckbox,
  IconBlockquote,
  IconH1,
  IconH2,
  IconH3,
  IconTypography,
  IconPhoto,
  IconTable,
  IconTablePlus,
  IconRowInsertBottom,
  IconRowRemove,
  IconColumnInsertRight,
  IconColumnRemove,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
  IconHighlight,
  IconPalette,
  IconMoodSmile,
  IconMathFunction,
  IconMovie,
  IconPaperclip,
  IconCalendar,
  IconAppWindow,
  IconBrackets,
  IconTerminal2,
  IconChevronDown,
  IconSeparatorHorizontal,
  IconPageBreak,
  IconArrowBackUp,
  IconArrowForwardUp,
} from "@tabler/icons-react";
import { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import classes from "./editor-toolbar.module.css";
import { uploadImageAction } from "../image/upload-image-action";
import { uploadVideoAction } from "../video/upload-video-action";
import { uploadAttachmentAction } from "../attachment/upload-attachment-action";
import IconExcalidraw from "@/components/icons/icon-excalidraw";
import IconMermaid from "@/components/icons/icon-mermaid";
import IconDrawio from "@/components/icons/icon-drawio";
import ColorPickerMenu from "./color-picker";

interface EditorToolbarProps {
  editor: Editor | null;
  pageId: string;
}

export default function EditorToolbar({ editor, pageId }: EditorToolbarProps) {
  const { t } = useTranslation();
  const [linkUrl, setLinkUrl] = useState("");
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [isTablePopoverOpen, setIsTablePopoverOpen] = useState(false);

  if (!editor) return null;

  const handleSetLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setIsLinkPopoverOpen(false);
    setLinkUrl("");
  };

  const handleInsertTable = () => {
    editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols }).run();
    setIsTablePopoverOpen(false);
  };

  const getCurrentHeadingLevel = () => {
    if (editor.isActive("heading", { level: 1 })) return "1";
    if (editor.isActive("heading", { level: 2 })) return "2";
    if (editor.isActive("heading", { level: 3 })) return "3";
    if (editor.isActive("heading", { level: 4 })) return "4";
    if (editor.isActive("heading", { level: 5 })) return "5";
    return "p";
  };

  const handleHeadingChange = (value: string | null) => {
    if (!value) return;
    
    if (value === "p") {
      editor.chain().focus().setParagraph().run();
    } else {
      const level = parseInt(value) as 1 | 2 | 3 | 4 | 5;
      editor.chain().focus().setHeading({ level }).run();
    }
  };

  const isTableActive = editor.isActive("table");

  return (
    <Paper className={classes.toolbar} shadow="xs" p="xs" withBorder>
      <Group gap="xs">
        {/* Undo/Redo */}
        <ActionIcon.Group>
          <Tooltip label={`${t("Undo")} (Ctrl+Z)`}>
            <ActionIcon
              variant="default"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <IconArrowBackUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={`${t("Redo")} (Ctrl+Y)`}>
            <ActionIcon
              variant="default"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <IconArrowForwardUp size={16} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" />

        {/* Text Style Selector */}
        <Select
          value={getCurrentHeadingLevel()}
          onChange={handleHeadingChange}
          data={[
            { value: "p", label: t("Normal text") },
            { value: "1", label: t("Heading 1") },
            { value: "2", label: t("Heading 2") },
            { value: "3", label: t("Heading 3") },
            { value: "4", label: t("Heading 4") },
            { value: "5", label: t("Heading 5") },
          ]}
          size="xs"
          w={140}
        />

        <Divider orientation="vertical" />

        {/* Text Formatting */}
        <ActionIcon.Group>
          <Tooltip label={t("Bold")}>
            <ActionIcon
              variant={editor.isActive("bold") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Italic")}>
            <ActionIcon
              variant={editor.isActive("italic") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <IconItalic size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Underline")}>
            <ActionIcon
              variant={editor.isActive("underline") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <IconUnderline size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Strikethrough")}>
            <ActionIcon
              variant={editor.isActive("strike") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <IconStrikethrough size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Code")}>
            <ActionIcon
              variant={editor.isActive("code") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <IconCode size={16} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        {/* Color Picker */}
        <ColorPickerMenu editor={editor} />

        <Divider orientation="vertical" />

        {/* Lists */}
        <ActionIcon.Group>
          <Tooltip label={t("Bullet List")}>
            <ActionIcon
              variant={editor.isActive("bulletList") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <IconList size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Numbered List")}>
            <ActionIcon
              variant={editor.isActive("orderedList") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <IconListNumbers size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Task List")}>
            <ActionIcon
              variant={editor.isActive("taskList") ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
            >
              <IconCheckbox size={16} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" />

        {/* Alignment */}
        <ActionIcon.Group>
          <Tooltip label={t("Align Left")}>
            <ActionIcon
              variant={editor.isActive({ textAlign: "left" }) ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              <IconAlignLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Align Center")}>
            <ActionIcon
              variant={editor.isActive({ textAlign: "center" }) ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              <IconAlignCenter size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Align Right")}>
            <ActionIcon
              variant={editor.isActive({ textAlign: "right" }) ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              <IconAlignRight size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Justify")}>
            <ActionIcon
              variant={editor.isActive({ textAlign: "justify" }) ? "filled" : "default"}
              size="sm"
              onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            >
              <IconAlignJustified size={16} />
            </ActionIcon>
          </Tooltip>
        </ActionIcon.Group>

        <Divider orientation="vertical" />

        {/* Link */}
        <Popover opened={isLinkPopoverOpen} onChange={setIsLinkPopoverOpen}>
          <Popover.Target>
            <Tooltip label={t("Insert Link")}>
              <ActionIcon
                variant={editor.isActive("link") ? "filled" : "default"}
                size="sm"
                onClick={() => setIsLinkPopoverOpen(!isLinkPopoverOpen)}
              >
                <IconLink size={16} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <TextInput
              placeholder={t("Enter URL")}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSetLink();
                }
              }}
              rightSection={
                <ActionIcon size="sm" onClick={handleSetLink}>
                  <IconLink size={14} />
                </ActionIcon>
              }
            />
          </Popover.Dropdown>
        </Popover>

        {/* Blockquote */}
        <Tooltip label={t("Blockquote")}>
          <ActionIcon
            variant={editor.isActive("blockquote") ? "filled" : "default"}
            size="sm"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <IconBlockquote size={16} />
          </ActionIcon>
        </Tooltip>

        {/* Code Block */}
        <Tooltip label={t("Code Block")}>
          <ActionIcon
            variant={editor.isActive("codeBlock") ? "filled" : "default"}
            size="sm"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <IconTerminal2 size={16} />
          </ActionIcon>
        </Tooltip>

        {/* Horizontal Rule */}
        <Tooltip label={t("Horizontal Rule")}>
          <ActionIcon
            variant="default"
            size="sm"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <IconSeparatorHorizontal size={16} />
          </ActionIcon>
        </Tooltip>

        <Divider orientation="vertical" />

        {/* Insert Menu */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button size="xs" variant="default" rightSection={<IconChevronDown size={14} />}>
              {t("Insert")}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t("Media")}</Menu.Label>
            <Menu.Item
              leftSection={<IconPhoto size={16} />}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (file && editor) {
                    const pos = editor.state.selection.from;
                    uploadImageAction(file, editor.view, pos, pageId);
                  }
                };
                input.click();
              }}
            >
              {t("Image")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMovie size={16} />}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/*';
                input.onchange = (event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (file && editor) {
                    const pos = editor.state.selection.from;
                    uploadVideoAction(file, editor.view, pos, pageId);
                  }
                };
                input.click();
              }}
            >
              {t("Video")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconPaperclip size={16} />}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = (event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (file && editor) {
                    const pos = editor.state.selection.from;
                    uploadAttachmentAction(file, editor.view, pos, pageId);
                  }
                };
                input.click();
              }}
            >
              {t("File")}
            </Menu.Item>
            
            <Menu.Divider />
            <Menu.Label>{t("Diagrams")}</Menu.Label>
            <Menu.Item
              leftSection={<IconDrawio size={16} />}
              onClick={() => editor.chain().focus().setDrawio().run()}
            >
              Draw.io
            </Menu.Item>
            <Menu.Item
              leftSection={<IconExcalidraw size={16} />}
              onClick={() => editor.chain().focus().setExcalidraw().run()}
            >
              Excalidraw
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMermaid size={16} />}
              onClick={() => editor
                .chain()
                .focus()
                .setCodeBlock({ language: "mermaid" })
                .insertContent("flowchart LR\n    A --> B")
                .run()}
            >
              Mermaid
            </Menu.Item>

            <Menu.Divider />
            <Menu.Label>{t("Other")}</Menu.Label>
            <Menu.Item
              leftSection={<IconMathFunction size={16} />}
              onClick={() => editor.chain().focus().setMathInline().run()}
            >
              {t("Math (Inline)")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMathFunction size={16} />}
              onClick={() => editor.chain().focus().setMathBlock().run()}
            >
              {t("Math (Block)")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCalendar size={16} />}
              onClick={() => {
                const date = new Date().toLocaleDateString();
                editor.chain().focus().insertContent(date).run();
              }}
            >
              {t("Date")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Table */}
        <Popover opened={isTablePopoverOpen} onChange={setIsTablePopoverOpen}>
          <Popover.Target>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconTable size={16} />}
              onClick={() => setIsTablePopoverOpen(!isTablePopoverOpen)}
            >
              {t("Table")}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Group gap="xs" mb="xs">
              <TextInput
                size="xs"
                type="number"
                min={1}
                max={10}
                value={tableRows}
                onChange={(e) => setTableRows(parseInt(e.currentTarget.value) || 3)}
                label={t("Rows")}
                w={80}
              />
              <TextInput
                size="xs"
                type="number"
                min={1}
                max={10}
                value={tableCols}
                onChange={(e) => setTableCols(parseInt(e.currentTarget.value) || 3)}
                label={t("Columns")}
                w={80}
              />
            </Group>
            <Button size="xs" fullWidth onClick={handleInsertTable}>
              {t("Insert Table")}
            </Button>
          </Popover.Dropdown>
        </Popover>

        {/* Table Controls (when table is active) */}
        {isTableActive && (
          <>
            <Divider orientation="vertical" />
            <ActionIcon.Group>
              <Tooltip label={t("Add Row Below")}>
                <ActionIcon
                  size="sm"
                  variant="default"
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  <IconRowInsertBottom size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Delete Row")}>
                <ActionIcon
                  size="sm"
                  variant="default"
                  onClick={() => editor.chain().focus().deleteRow().run()}
                >
                  <IconRowRemove size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Add Column Right")}>
                <ActionIcon
                  size="sm"
                  variant="default"
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  <IconColumnInsertRight size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Delete Column")}>
                <ActionIcon
                  size="sm"
                  variant="default"
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                >
                  <IconColumnRemove size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Delete Table")}>
                <ActionIcon
                  size="sm"
                  variant="default"
                  color="red"
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  <IconTable size={16} />
                </ActionIcon>
              </Tooltip>
            </ActionIcon.Group>
          </>
        )}
      </Group>
    </Paper>
  );
}
