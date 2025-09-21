import React, { useState } from "react";
import {
  ActionIcon,
  ColorPicker,
  Group,
  Popover,
  Text,
  Button,
  Stack,
} from "@mantine/core";
import { IconPalette, IconHighlight } from "@tabler/icons-react";
import { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";

interface ColorPickerMenuProps {
  editor: Editor;
}

const PRESET_COLORS = [
  "#000000", // Black
  "#6B7280", // Gray
  "#EF4444", // Red
  "#F59E0B", // Orange
  "#10B981", // Green
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#FBBF24", // Yellow
  "#34D399", // Emerald
];

const HIGHLIGHT_COLORS = [
  "transparent", // No highlight
  "#FEF3C7", // Yellow
  "#FED7AA", // Orange
  "#FECACA", // Red
  "#E9D5FF", // Purple
  "#BFDBFE", // Blue
  "#A7F3D0", // Green
  "#FBCFE8", // Pink
  "#E0E7FF", // Indigo
  "#CFFAFE", // Cyan
];

export default function ColorPickerMenu({ editor }: ColorPickerMenuProps) {
  const { t } = useTranslation();
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("transparent");

  const handleTextColorChange = (color: string) => {
    setTextColor(color);
    editor.chain().focus().setColor(color).run();
  };

  const handleHighlightColorChange = (color: string) => {
    setHighlightColor(color);
    if (color === "transparent") {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().toggleHighlight({ color }).run();
    }
  };

  const removeTextColor = () => {
    editor.chain().focus().unsetColor().run();
    setTextColor("#000000");
  };

  const removeHighlight = () => {
    editor.chain().focus().unsetHighlight().run();
    setHighlightColor("transparent");
  };

  return (
    <Group gap={0}>
      {/* Text Color */}
      <Popover opened={isTextColorOpen} onChange={setIsTextColorOpen}>
        <Popover.Target>
          <ActionIcon
            variant="default"
            size="sm"
            onClick={() => setIsTextColorOpen(!isTextColorOpen)}
          >
            <IconPalette size={16} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("Text Color")}
            </Text>
            <ColorPicker
              format="hex"
              value={textColor}
              onChange={handleTextColorChange}
              swatches={PRESET_COLORS}
              size="sm"
            />
            <Button size="xs" variant="light" onClick={removeTextColor}>
              {t("Remove Color")}
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {/* Highlight Color */}
      <Popover opened={isHighlightOpen} onChange={setIsHighlightOpen}>
        <Popover.Target>
          <ActionIcon
            variant={editor.isActive("highlight") ? "filled" : "default"}
            size="sm"
            onClick={() => setIsHighlightOpen(!isHighlightOpen)}
          >
            <IconHighlight size={16} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("Highlight Color")}
            </Text>
            <ColorPicker
              format="hex"
              value={highlightColor}
              onChange={handleHighlightColorChange}
              swatches={HIGHLIGHT_COLORS}
              size="sm"
            />
            <Button size="xs" variant="light" onClick={removeHighlight}>
              {t("Remove Highlight")}
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
