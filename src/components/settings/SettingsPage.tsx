import { useTranslation } from "react-i18next";
import { GeneralSettings } from "./general/GeneralSettings";
import { AdvancedSettings } from "./advanced/AdvancedSettings";

export function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <section aria-labelledby="general-settings-heading" className="space-y-4">
        <h1 id="general-settings-heading" className="text-lg font-semibold">
          {t("sidebar.general")}
        </h1>
        <GeneralSettings />
      </section>
      <section
        aria-labelledby="advanced-settings-heading"
        className="space-y-4 border-t border-mid-gray/20 pt-6"
      >
        <h2 id="advanced-settings-heading" className="text-lg font-semibold">
          {t("sidebar.advanced")}
        </h2>
        <AdvancedSettings />
      </section>
    </div>
  );
}
