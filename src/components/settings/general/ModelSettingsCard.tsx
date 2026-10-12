import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";

export const ModelSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SettingsGroup>
      <SettingContainer title={t("plotFlow.modelLabel")} description="" grouped>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span className="text-sm">GigaAM v3 E2E-CTC</span>
      </SettingContainer>
    </SettingsGroup>
  );
};
