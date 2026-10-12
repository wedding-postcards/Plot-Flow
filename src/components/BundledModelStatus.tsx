import { useTranslation } from "react-i18next";
import type { BundledModelStatus as ModelStatus } from "@/lib/bundledModel";

export function BundledModelStatus({
  status,
  onRetry,
}: {
  status: ModelStatus;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (status === "ready" || status === "available") return null;
  const pending = status === "checking" || status === "loading";
  return (
    <div
      role={pending ? "status" : "alert"}
      className="w-full max-w-3xl px-4 py-2 text-sm border border-mid-gray/20 rounded-lg"
    >
      <p>{t(`plotFlow.${status}`)}</p>
      {!pending && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-logo-stroke underline cursor-pointer"
        >
          {t("plotFlow.retry")}
        </button>
      )}
    </div>
  );
}
