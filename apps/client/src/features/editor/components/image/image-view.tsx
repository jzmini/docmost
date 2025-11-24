import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useMemo } from "react";
import { Image } from "@mantine/core";
import { getFileUrl } from "@/lib/config.ts";
import clsx from "clsx";

export default function ImageView(props: NodeViewProps) {
  const { node, selected } = props;
  const { src, width, align, title } = node.attrs;

  const transformedUrl = getFileUrl(src);

  const alignClass = useMemo(() => {
    if (align === "left") return "alignLeft";
    if (align === "right") return "alignRight";
    if (align === "center") return "alignCenter";
    return "alignCenter";
  }, [align]);

  return (
    <NodeViewWrapper>
      <Image
        radius="md"
        fit="contain"
        w={width}
        src={transformedUrl}
        alt={title}
        className={clsx(selected ? "ProseMirror-selectednode" : "", alignClass)}
        // Required to send cookies with image requests for authenticated endpoints
        // @ts-ignore - crossOrigin prop not in Mantine Image types
        crossOrigin="use-credentials"
      />
    </NodeViewWrapper>
  );
}
