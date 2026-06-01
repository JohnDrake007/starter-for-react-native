import React from "react";
import { Svg, Path, Circle, Rect } from "react-native-svg";
import type { SvgProps } from "react-native-svg";

type IconProps = SvgProps & { size?: number };

function createIcon(d: string, viewBox: string = "24 24") {
  const Icon = ({ size = 24, color = "currentColor", ...props }: IconProps) => (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBox}`} fill="none" {...props}>
      <Path d={d} fill={color} stroke={color} strokeWidth={0} />
    </Svg>
  );
  Icon.displayName = d.slice(0, 20);
  return Icon;
}

function createStrokeIcon(paths: string[], viewBox: string = "24 24") {
  const Icon = ({ size = 24, color = "currentColor", ...props }: IconProps) => (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBox}`} fill="none" {...props}>
      {paths.map((p, i) => (
        <Path key={i} d={p} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
  Icon.displayName = paths[0]?.slice(0, 20) || "Icon";
  return Icon;
}

export const LayoutDashboard = createStrokeIcon([
  "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
]);

export const Users = createStrokeIcon([
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
  "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "M22 21v-2a4 4 0 0 0-3-3.87",
  "M16 3.13a4 4 0 0 1 0 7.75",
]);

export const PlusCircle = createStrokeIcon([
  "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z",
  "M12 8v8M8 12h8",
]);

export const Calendar = createStrokeIcon([
  "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z",
  "M16 2v4M8 2v4M3 10h18",
]);

export const Check = createStrokeIcon([
  "M20 6L9 17l-5-5",
]);

export const MoreHorizontal = createStrokeIcon(["M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"]);

export const Bell = createStrokeIcon([
  "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9",
  "M13.73 21a2 2 0 0 1-3.46 0",
]);

export const Search = createStrokeIcon(["M21 21l-6-6M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0z"]);

export const Phone = createStrokeIcon(["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"]);

export const MapPin = createStrokeIcon(["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]);

export const Sprout = createStrokeIcon([
  "M12 22V8",
  "M5 12H2a10 10 0 0 0 20 0h-3",
  "M7 12V5a5 5 0 0 1 10 0v7",
]);

export const ArrowLeft = createStrokeIcon(["M19 12H5M12 19l-7-7 7-7"]);

export const ArrowRight = createStrokeIcon(["M5 12h14M12 5l7 7-7 7"]);

export const ChevronRight = createStrokeIcon(["M9 18l6-6-6-6"]);

export const UserPlus = createStrokeIcon([
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
  "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "M19 8v4M21 10h-4",
]);

export const Package = createStrokeIcon([
  "M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  "M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
]);

export const ClipboardList = createStrokeIcon([
  "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1-2-2h2",
  "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  "M9 12h6M9 16h6",
]);

export const Database = createStrokeIcon([
  "M12 2C6.48 2 2 4.02 2 6.5v11C2 19.98 6.48 22 12 22s10-2.02 10-4.5v-11C22 4.02 17.52 2 12 2z",
  "M2 6.5C2 8.98 6.48 11 12 11s10-2.02 10-4.5",
  "M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5",
]);

export const Leaf = createStrokeIcon([
  "M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z",
  "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
]);

export const CheckCircle = createStrokeIcon([
  "M22 11.08V12a10 10 0 1 1-5.93-9.14",
  "M22 4L12 14.01l-3-3",
]);

export const Share2 = createStrokeIcon([
  "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
  "M16 6l-4-4-4 4M12 2v13",
]);

export const Clock = createStrokeIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M12 6v6l4 2"]);

export const Tag = createStrokeIcon(["M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01"]);

export const ChevronLeft = createStrokeIcon(["M15 18l-6-6 6-6"]);

export const ChevronDown = createStrokeIcon(["M6 9l6 6 6-6"]);

export const X = createStrokeIcon(["M18 6L6 18M6 6l12 12"]);

export const Eye = createStrokeIcon(["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]);

export const Camera = createStrokeIcon(["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"]);

export const FileText = createStrokeIcon(["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6M16 13H8M16 17H8M10 9H8"]);

export const Info = createStrokeIcon(["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "M12 16v-4M12 8h.01"]);

export const Plus = createStrokeIcon(["M12 5v14M5 12h14"]);

export const Trash2 = createStrokeIcon(["M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"]);

export const ExternalLink = createStrokeIcon(["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"]);

export const Pencil = createStrokeIcon(["M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"]);

export const Pill = createStrokeIcon(["M10.5 1.5l-8.5 8.5a4.95 4.95 0 0 0 7 7l8.5-8.5a4.95 4.95 0 0 0-7-7z", "M9 6l9 9"]);

export const Filter = createStrokeIcon(["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"]);

export const ClipboardCheck = createStrokeIcon(["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M9 14l2 2 4-4"]);

export const Beaker = createStrokeIcon(["M4 2h16l-2 12H6L4 2zM6 14l-2 6h16l-2-6", "M9 6h6M9 10h4"]);

export const Hash = createStrokeIcon(["M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"]);

export const RefreshCw = createStrokeIcon(["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"]);

export const Wifi = createStrokeIcon(["M5 12.55a11 11 0 0 1 14.08 0", "M1.42 9a16 16 0 0 1 21.16 0", "M8.53 16.11a6 6 0 0 1 6.95 0", "M12 20h.01"]);

export const WifiOff = createStrokeIcon(["M1 1l22 22", "M16.72 11.06A10.94 10.94 0 0 1 19 12.55", "M5 12.55a10.94 10.94 0 0 1 5.17-2.39", "M10.71 5.05A16 16 0 0 1 22.56 9", "M1.42 9a15.91 15.91 0 0 1 4.7-2.88", "M8.53 16.11a6 6 0 0 1 6.95 0", "M12 20h.01"]);

export const CloudOff = createStrokeIcon(["M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3", "M1 1l22 22"]);

export const CloudCheck = createStrokeIcon(["M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z", "M9 13l2 2 4-4"]);