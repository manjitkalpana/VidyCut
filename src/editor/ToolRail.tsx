import { useEditor } from "./store";
import { Icon } from "../components/Icon";
export const toolList = [
  ["Media", "media"],
  ["Audio", "audio"],
  ["Text", "text"],
  ["Captions", "captions"],
  ["Stickers", "stickers"],
  ["Effects", "effects"],
  ["Filters", "filters"],
  ["Transitions", "transitions"],
  ["Templates", "templates"],
  ["Elements", "elements"],
  ["AI Tools", "ai"],
  ["Adjust", "adjust"],
  ["Speed", "speed"],
  ["Animation", "animation"],
  ["Background", "background"],
  ["Mask", "mask"],
  ["Chroma Key", "chroma"],
];
export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  return (
    <nav className="tool-rail" aria-label="Editing tools">
      {toolList.map(([label, icon]) => (
        <button
          key={label}
          title={label}
          aria-label={label}
          aria-pressed={tool === label}
          className={tool === label ? "active" : ""}
          onClick={() => useEditor.getState().set({ tool: label })}
        >
          <Icon name={icon} size={21} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
