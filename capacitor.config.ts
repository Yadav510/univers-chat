import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.univers",
  appName: "Univers",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
