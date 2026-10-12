import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";

const Footer: React.FC = () => {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="w-full border-t border-mid-gray/20 pt-3">
      <div className="flex justify-end items-center text-xs px-4 pb-3 text-text/60">
        {/* Update Status */}
        <div className="flex items-center gap-1">
          {/* eslint-disable-next-line i18next/no-literal-string */}
          {version && <span>v{version}</span>}
        </div>
      </div>
    </div>
  );
};

export default Footer;
