"use client";

import type { ComponentType, SVGProps } from "react";
import { Icon } from "@iconify/react";
import { SOLAR_ICONS, type SolarIconKey } from "./solar-data";

export interface PremiumIconProps {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
  strokeWidth?: number | string;
  size?: number | string;
}

export type PremiumIcon = ComponentType<PremiumIconProps>;
export type LucideIcon = PremiumIcon;

function makeSolarIcon(key: SolarIconKey): PremiumIcon {
  const iconData = SOLAR_ICONS[key];
  function SolarGlyph({ className, "aria-hidden": ariaHidden, "aria-label": ariaLabel }: PremiumIconProps) {
    return (
      <Icon
        icon={iconData}
        className={className}
        aria-hidden={ariaHidden}
        aria-label={ariaLabel}
        inline={false}
      />
    );
  }
  SolarGlyph.displayName = `Solar(${key})`;
  return SolarGlyph;
}

export const AlertTriangle = makeSolarIcon("AlertTriangle");
export const ArrowDown = makeSolarIcon("ArrowDown");
export const ArrowDownRight = makeSolarIcon("ArrowDownRight");
export const ArrowLeft = makeSolarIcon("ArrowLeft");
export const ArrowRight = makeSolarIcon("ArrowRight");
export const ArrowUp = makeSolarIcon("ArrowUp");
export const ArrowUpRight = makeSolarIcon("ArrowUpRight");
export const Bell = makeSolarIcon("Bell");
export const CalendarClock = makeSolarIcon("CalendarClock");
export const Check = makeSolarIcon("Check");
export const CheckCircle2 = makeSolarIcon("CheckCircle2");
export const ChevronRight = makeSolarIcon("ChevronRight");
export const Clock3 = makeSolarIcon("Clock3");
export const CloudRain = makeSolarIcon("CloudRain");
export const Copy = makeSolarIcon("Copy");
export const Database = makeSolarIcon("Database");
export const Download = makeSolarIcon("Download");
export const FileSpreadsheet = makeSolarIcon("FileSpreadsheet");
export const FileText = makeSolarIcon("FileText");
export const Grid3x3 = makeSolarIcon("Grid3x3");
export const Info = makeSolarIcon("Info");
export const LineChart = makeSolarIcon("LineChart");
export const ListOrdered = makeSolarIcon("ListOrdered");
export const Lock = makeSolarIcon("Lock");
export const LogOut = makeSolarIcon("LogOut");
export const Mail = makeSolarIcon("Mail");
export const Map = makeSolarIcon("Map");
export const MapPin = makeSolarIcon("MapPin");
export const Menu = makeSolarIcon("Menu");
export const MessageCircle = makeSolarIcon("MessageCircle");
export const MessageSquare = makeSolarIcon("MessageSquare");
export const MessageSquareText = makeSolarIcon("MessageSquareText");
export const Minus = makeSolarIcon("Minus");
export const Moon = makeSolarIcon("Moon");
export const Plus = makeSolarIcon("Plus");
export const Printer = makeSolarIcon("Printer");
export const RefreshCw = makeSolarIcon("RefreshCw");
export const RotateCcw = makeSolarIcon("RotateCcw");
export const RotateCw = makeSolarIcon("RotateCw");
export const Search = makeSolarIcon("Search");
export const ShieldCheck = makeSolarIcon("ShieldCheck");
export const Sparkles = makeSolarIcon("Sparkles");
export const Square = makeSolarIcon("Square");
export const Sun = makeSolarIcon("Sun");
export const Timer = makeSolarIcon("Timer");
export const X = makeSolarIcon("X");

export type { SVGProps };
