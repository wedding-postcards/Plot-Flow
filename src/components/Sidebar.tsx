import React from "react";
import { useTranslation } from "react-i18next";
import { ChartNoAxesCombined, History, Mic } from "lucide-react";

import { SettingsPage, StatisticsSettings, HistorySettings } from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  settings: {
    labelKey: "sidebar.settings",
    icon: Mic,
    component: SettingsPage,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  statistics: {
    labelKey: "sidebar.statistics",
    icon: ChartNoAxesCombined,
    component: StatisticsSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();

  const availableSections = Object.entries(SECTIONS_CONFIG).map(
    ([id, config]) => ({ id: id as SidebarSection, ...config }),
  );

  return (
    <div className="flex flex-col w-40 h-full border-e border-mid-gray/20 items-center px-2">
      <img
        src="/plot-flow-logo-transparent.png"
        alt="Plot Flow"
        width={132}
        className="m-4 w-[132px] max-h-20 object-contain"
      />
      <div className="flex flex-col w-full items-center gap-1 pt-2 border-t border-mid-gray/20">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <div
              key={section.id}
              className={`flex gap-2 items-center p-2 w-full rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-logo-primary/80"
                  : "hover:bg-mid-gray/20 hover:opacity-100 opacity-85"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              <Icon width={24} height={24} className="shrink-0" />
              <p
                className="text-sm font-medium truncate"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </p>
            </div>
          );
        })}
      </div>
      <img
        src="/bilbo-baggins-transparent.png"
        alt=""
        aria-hidden="true"
        className="mt-auto w-32 h-36 object-contain shrink-0"
      />
    </div>
  );
};
